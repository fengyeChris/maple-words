const app = document.getElementById('app');
const toast = document.getElementById('toast');
const qs = new URLSearchParams(location.search);
const userKey = 'beidanci-local-user';
const savedUserId = localStorage.getItem(userKey);
const userId = !savedUserId || /^local-[a-z0-9]+$/i.test(savedUserId) ? 'local-user' : savedUserId;
localStorage.setItem(userKey, userId);
const state = { courses: [], words: [], index: 0, correct: 0, wrong: 0, answered: false, mode: '', selected: null, actions: {} };
const actionSaves = new Map();
const studyModes = [['flash','单词快过','▶'],['write','写出英文','✎'],['meaning','英文选义','✓'],['match','单词对对碰','⊞']];
const markFilters = [['all','全部'],['favorite','星标'],['unknown','不认识'],['fuzzy','模糊']];
function reviewFilter(value){return markFilters.some(([key])=>key===value) ? value : 'all';}
function filterLabel(filter){return markFilters.find(([key])=>key===filter)?.[1] || '全部';}
function markedActions(actions,filter){return actions.filter(a=>a.word && (filter==='all' ? a.favorite || a.unknown || a.fuzzy : a[filter]));}
function notesHref(filter){return `/myNotes.html?filter=${reviewFilter(filter)}`;}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Local-User': userId, ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || '请求失败'),{status:res.status});
  return data;
}
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2300); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function layout(content, opts = {}) {
  const title = opts.title || '枫叶单词 · 本地版';
  document.title = title;
  return `<div class="site-header"><div class="shell header-inner"><a class="brand" href="/"><span class="brand-mark"><img src="/assets/maple-icon-192.png" width="38" height="38" alt="" /></span><span class="brand-copy"><strong>枫叶单词</strong><span>每天一词，积叶成林</span></span></a><div class="header-actions"><form class="search-box" id="global-search"><input name="q" placeholder="搜索单词或中文释义" autocomplete="off"/><button>搜索</button></form><a href="/library.html">词书管理</a><a href="/myNotes.html">我的笔记</a><a href="/learningStats.html">学习统计</a><a class="primary" href="/settings.html">设置</a></div></div></div>${content}<div class="footer">枫叶单词 · 本地学习版　支持课程、单词书和学习记录</div>`;
}
function bindGlobal() {
  const f = document.getElementById('global-search'); if (f) f.onsubmit = e => { e.preventDefault(); const q = new FormData(f).get('q'); location.href = `/wordSearch.html?q=${encodeURIComponent(q)}`; };
}
async function getCourses() { if (!state.courses.length) state.courses = await api('/api/courses'); return state.courses; }
function unitIdFor(course, index) { return course.id * 100 + index + 1; }
function modeHref(mode, courseId, unitId, review) { const page = { meaning: 'englishToMeaning.html', flash: 'flashCard.html', write: 'writeItInEnglish.html', match: 'wordMatchGame.html' }[mode]; return review ? `/${page}?review=${review.filter}&session=${encodeURIComponent(review.session)}` : `/${page}?course_id=${courseId}&unit_id=${unitId}`; }
function modeTabs(active, courseId, unitId, review) { return `<div class="mode-tabs">${studyModes.map(([key,label,icon]) => `<a class="${active===key?'active':''}" href="${modeHref(key,courseId,unitId,review)}"><span>${icon}</span> ${label}</a>`).join('')}</div>`; }
function reviewLinks(filter,hasWords){return `<div class="review-modes">${studyModes.map(([mode,label,icon])=>hasWords ? `<a class="btn" data-review-mode="${mode}" href="/${{flash:'flashCard',write:'writeItInEnglish',meaning:'englishToMeaning',match:'wordMatchGame'}[mode]}.html?review=${filter}">${icon} ${label}</a>` : `<button class="btn" disabled>${icon} ${label}</button>`).join('')}</div>`;}
function bindReviewLinks(words,filter){document.querySelectorAll('[data-review-mode]').forEach(link=>link.onclick=e=>{e.preventDefault();if(!words.length)return;const session=crypto.randomUUID();sessionStorage.setItem('beidanci-review-'+session,JSON.stringify({filter,wordIds:[...new Set(words.map(w=>w.id))]}));location.href=modeHref(link.dataset.reviewMode,null,null,{filter,session});});}

async function home() {
  const courses=await getCourses(), dash=await api('/api/dashboard');
  const selected=courses.find(c=>c.id===dash.last?.course_id) || courses.find(c=>c.id===4) || courses[0];
  const unit=selected?.units.find(u=>u.id===dash.last?.unit_id) || selected?.units[0];
  const resume=unit ? modeHref('meaning',selected.id,unit.id) : '/library.html';
  app.innerHTML=layout(`<main class="page shell"><section class="hero"><div><div class="eyebrow">本地英语学习</div><h1>每天进步一点，<br>把单词真正记住。</h1><p>词书和进度保存在本机，导入后可离线学习。</p></div><div class="hero-actions"><a class="btn primary" href="${resume}">开始学习</a><a class="btn" href="/library.html">导入词书</a></div></section><section class="stats-grid grid"><div class="stat-card"><span>连续学习</span><strong>${dash.streak} 天</strong></div><div class="stat-card"><span>已学词条</span><strong>${dash.learned}</strong></div><div class="stat-card"><span>星标单词</span><strong>${dash.favorite}</strong></div><div class="stat-card"><span>不认识</span><strong>${dash.unknown}</strong></div></section><section class="banner"><div><h2>${dash.last?'继续上次学习':'开始第一轮练习'}</h2><p>${esc(selected?.title || '请先导入词书')}${unit?' · '+esc(unit.title):''}</p></div><a class="btn primary" href="${resume}">进入学习 →</a></section><div class="section-head"><h2>选择词书</h2><span>${courses.length} 本本地词书 · ${courses.reduce((n,c)=>n+c.total_words,0).toLocaleString()} 词条</span></div><section class="course-grid grid">${courses.map(c=>`<article class="course-card book-card"><a class="book-cover-area" href="/courseDetail.html?course_id=${c.id}"><div class="book-cover"><span>ENGLISH VOCABULARY</span><strong>${esc(c.title.split(' · ')[0])}</strong><small>${esc(c.source==='ECDICT'?'ECDICT 学习词表':c.id===4?'六级核心 · 2078词':'本地词书')}</small><b>MAPLE</b></div></a><div class="book-body"><h3>${esc(c.title)}</h3><p class="book-desc">${esc(c.description)}</p><p>${c.total_words.toLocaleString()} 词 · ${c.units.length} 单元</p><div class="course-meta"><span>已学 ${c.learned} 词</span><span>${c.percent}%</span></div><div class="progress"><i style="width:${c.percent}%"></i></div><a class="btn" href="/courseDetail.html?course_id=${c.id}">查看单元</a></div></article>`).join('') || '<div class="empty">还没有词书，请前往词书管理导入。</div>'}</section></main>`); bindGlobal();
}
async function courseDetail() {
  const courses=await getCourses(); const course=courses.find(c=>c.id===Number(qs.get('course_id') || 4));
  if(!course) { app.innerHTML=layout('<main class="page shell"><div class="empty">词书不存在。<a href="/library.html">导入词书</a></div></main>');bindGlobal();return; }
  const units=course.units;
  app.innerHTML=layout(`<main class="page shell"><div class="course-detail-head"><div><a class="muted" href="/">← 返回首页</a><h1>${esc(course.title)}</h1><p>${course.total_words} 词 · ${units.length} 单元 · 已学 ${course.learned} 词</p><p>${esc(course.description)}</p></div>${units.length?`<a class="btn primary" href="${modeHref('meaning',course.id,units[0].id)}">从第1单元开始</a>`:''}</div><section class="panel"><div class="section-head" style="margin-top:0"><h2>全部单元</h2><span>末单元按实际词数显示</span></div><div class="unit-grid grid">${units.map(u=>`<article class="unit-card"><h3>${esc(u.title)}</h3><p>${u.total_words} 个词 · 已学 ${u.learned} · ${u.percent}%</p><div class="progress"><i style="width:${u.percent}%"></i></div><a class="btn" href="${modeHref('meaning',course.id,u.id)}">练习本单元</a></article>`).join('') || '<div class="empty">尚无可学习单元</div>'}</div></section></main>`); bindGlobal();
}
async function library() {
  state.courses=[]; const courses=await getCourses();
  app.innerHTML=layout(`<main class="page shell"><section class="hero"><div><div class="eyebrow">本地词库</div><h1>词书管理</h1><p>选择 JSON 词书包导入；导入成功后即可断网学习。</p></div><a class="btn" href="/">返回词书</a></section><section class="panel"><h2>导入词书</h2><p class="muted">支持 wordbook/v1 格式，单个文件不超过40MB。同一词书按 key 更新，保留仍在原单元内的词条编号与学习标记。</p><div class="import-row"><input type="file" id="pack-file" accept=".json,application/json"><button class="btn primary" id="import-pack">导入选中文件</button></div><p id="import-status" role="status" class="muted">六级核心完整备份位于 resources/cet6-core/cet6-core.json，可直接导入。</p></section><div class="section-head"><h2>已安装词书</h2><span>${courses.length} 本</span></div><section class="library-list">${courses.map(c=>`<article class="panel library-item"><div><h2>${esc(c.title)}</h2><p>${c.total_words} 词 · ${c.units.length} 单元 · 版本 ${esc(c.version || '缓存预览')}</p><p class="muted">来源：${esc(c.source_url || c.source)}<br>许可：${esc(c.license || '原项目缓存，请核对内容来源')}</p></div><div class="hero-actions"><a class="btn primary" href="/courseDetail.html?course_id=${c.id}">学习</a><button class="btn" data-export="${c.id}">导出词书</button></div></article>`).join('')}</section></main>`); bindGlobal();
  document.getElementById('import-pack').onclick=async e=>{ const file=document.getElementById('pack-file').files[0],status=document.getElementById('import-status'); if(!file) {status.textContent='请先选择一个 JSON 词书文件';return;} if(file.size>40*1024*1024) {status.textContent='文件不能超过40MB';return;} e.target.disabled=true;status.textContent='正在检查并导入，请稍候…';try { const pack=JSON.parse((await file.text()).replace(/^\uFEFF/,''));const result=await api('/api/library/import',{method:'POST',body:JSON.stringify(pack)});await library();document.getElementById('import-status').textContent=`已导入：${result.title}，${result.total_words}词，${result.unit_count}单元。`;showToast('词书导入成功');} catch(err){status.textContent='导入失败：'+err.message;e.target.disabled=false;} };
  document.querySelectorAll('[data-export]').forEach(b=>b.onclick=async()=>{try{const pack=await api('/api/library/export/'+b.dataset.export);const url=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=pack.book.key+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch(e){showToast(e.message);}});
}

async function loadWords() {
  state.courseId=Number(qs.get('course_id') || 4);state.unitId=Number(qs.get('unit_id') || 154);
  const actions=await api('/api/word-actions');state.actions=Object.fromEntries(actions.map(a=>[String(a.word_id),a]));
  state.review=null;
  if(qs.has('review')){
    const filter=reviewFilter(qs.get('review'));let session=qs.get('session'),saved;
    try{saved=JSON.parse(sessionStorage.getItem('beidanci-review-'+session));}catch{}
    if(!saved || saved.filter!==filter || !Array.isArray(saved.wordIds)){
      session=crypto.randomUUID();saved={filter,wordIds:markedActions(actions,filter).map(a=>a.word_id)};
      sessionStorage.setItem('beidanci-review-'+session,JSON.stringify(saved));
      const url=new URL(location.href);url.searchParams.set('review',filter);url.searchParams.set('session',session);history.replaceState(null,'',url);
    }
    const ids=[...new Set(saved.wordIds)].filter(id=>Number.isSafeInteger(id) && id>0);
    state.words=(await Promise.all(ids.map(async id=>state.actions[String(id)]?.word || await api('/api/words/'+id).catch(error=>{if(error.status===404)return null;throw error;})))).filter(Boolean);
    state.review={filter,session};
  }else state.words=await api(`/api/courses/${state.courseId}/units/${state.unitId}/words`);
  state.index=0;state.correct=0;state.wrong=0;state.answered=false;state.selected=null;state.studied=new Set();state.busy=false;
  state.results=new Map();state.optionWords=[];
  if(state.review && state.mode==='meaning' && new Set(state.words.map(w=>w.meaning)).size<4){
    const units=new Map(state.words.map(w=>[w.unit_id,w]));
    for(const word of units.values()){
      state.optionWords.push(...await api(`/api/courses/${word.course_id}/units/${word.unit_id}/words`));
      if(new Set([...state.words,...state.optionWords].map(w=>w.meaning)).size>=4)break;
    }
  }
}
function currentWord(){return state.words[state.index];}
async function recordProgress(word){
  const words=state.review ? state.words.filter(w=>state.studied.has(w.id) && w.course_id===word.course_id && w.unit_id===word.unit_id) : [];
  const correct=state.review ? words.filter(w=>state.results.get(w.id)).length : state.correct;
  const wrong=state.review ? words.filter(w=>state.results.get(w.id)===false).length : state.wrong;
  await api('/api/progress',{method:'POST',body:JSON.stringify({course_id:state.review ? word.course_id : state.courseId,unit_id:state.review ? word.unit_id : state.unitId,answered:correct+wrong,correct,wrong,mode:state.mode,studied_ids:state.review ? words.map(w=>w.id) : [...state.studied]})});
}
async function act(word,type,value){
  const key=String(word.id),previous=state.actions[key];
  const action={...(previous || {}),[type]:value ?? !previous?.[type],word_id:word.id,courseId:word.course_id ?? state.courseId,unitId:word.unit_id ?? state.unitId};
  state.actions[key]=action;
  const save=(actionSaves.get(key) || Promise.resolve()).catch(()=>{}).then(()=>api('/api/word-actions',{method:'POST',body:JSON.stringify(action)}));
  actionSaves.set(key,save);syncWordMarks();
  try{await save;}catch(error){if(state.actions[key]===action){if(previous)state.actions[key]=previous;else delete state.actions[key];}throw error;}
  finally{if(actionSaves.get(key)===save)actionSaves.delete(key);syncWordMarks();}
}
function markWord(){return state.mode==='match' ? state.matchPairs?.find(w=>String(w.id)===state.matchMarkId) : currentWord();}
function syncWordMarks(){
  const word=markWord(),action=word ? state.actions[String(word.id)] || {} : {};
  const target=document.getElementById('mark-target');
  if(target)target.textContent=word ? `当前标记：${word.word}` : '先选择左侧单词，再添加标记';
  document.querySelectorAll('[data-mark]').forEach(b=>{
    b.disabled=!word || actionSaves.has(String(word.id));
    b.classList.toggle('active',Boolean(action[b.dataset.mark]));
    b.setAttribute('aria-pressed',String(Boolean(action[b.dataset.mark])));
  });
}
async function answer(word,ok){state.busy=true;state.studied.add(word.id);state.results.set(word.id,ok);state.correct=[...state.results.values()].filter(Boolean).length;state.wrong=state.results.size-state.correct;const good=document.querySelector('.score-row .good'),bad=document.querySelector('.score-row .bad'),rate=document.querySelectorAll('.score-row strong')[2];if(good)good.textContent=state.correct;if(bad)bad.textContent=state.wrong;if(rate)rate.textContent=Math.round(state.correct*100/(state.correct+state.wrong))+'%';try{await act(word,'unknown',!ok);await recordProgress(word);}finally{state.busy=false;}}
function shuffled(items){return items.map(x=>({x,r:Math.random()})).sort((a,b)=>a.r-b.r).map(v=>v.x);}
function makeOptions(word){return shuffled([word.meaning,...shuffled([...new Set([...state.words,...(state.optionWords || [])].filter(w=>w.meaning!==word.meaning).map(w=>w.meaning))]).slice(0,3)]);}

function renderStudyPage() {
  document.onkeydown=null;
  const courseId = state.courseId, unitId = state.unitId, word = currentWord();
  if (!state.words.length) { app.innerHTML=layout(state.review ? `<main class="page shell"><div class="panel empty">「${filterLabel(state.review.filter)}」暂无可练习的重点单词。<br><a href="${notesHref(state.review.filter)}">返回重点单词</a></div></main>` : '<main class="page shell"><div class="empty">本单元没有词条。<a href="/library.html">管理词书</a></div></main>');bindGlobal();return; }
  if (!word) return finishStudy();
  const opts = state.mode === 'meaning' ? makeOptions(word) : [];
  const action = state.actions[String(word.id)] || {};
  const center = state.mode === 'meaning' ? `<div class="study-card"><div class="badge">第 ${state.index + 1} / ${state.words.length} 词</div><div><h1 class="word-title">${esc(word.word)} <button class="audio-btn" id="audio">🔊</button></h1><p class="word-phonetic">${esc(word.phonetic || '')}</p><p class="word-pos">${esc(word.pos || '')}</p></div><div class="options">${opts.map((o,i)=>`<button class="option" data-option="${i}">${esc(o)}</button>`).join('')}</div><div class="study-actions"><button class="btn" id="skip">跳过</button><button class="btn primary" id="next" disabled>下一个</button><button class="btn" id="finish">结束测试</button></div></div>` : renderAlternativeMode(word, action);
  app.innerHTML = `<div class="learning-shell"><div class="learning-nav">${state.review?`<a href="${notesHref(state.review.filter)}">← 返回重点单词</a>`:`<a href="/courseDetail.html?course_id=${courseId}">← 返回单元列表</a>`}<span class="divider"></span><a href="/">⌂ 返回首页</a></div><main class="learning-main">${modeTabs(state.mode, courseId, unitId, state.review)}${state.review?`<p class="review-context">重点单词 · ${filterLabel(state.review.filter)} · 本轮 ${state.words.length} 词</p>`:''}${center}</main><footer class="study-footer"><div class="study-footer-inner"><div class="score-row"><div><span>正确</span><strong class="good">${state.correct}</strong></div><div><span>错误</span><strong class="bad">${state.wrong}</strong></div><div><span>正确率</span><strong>${state.correct + state.wrong ? Math.round(state.correct * 100 / (state.correct + state.wrong)) : 0}%</strong></div></div><div class="study-progress-head"><span>学习进度</span><strong>${state.index}/${state.words.length}</strong></div><div class="progress"><i style="width:${Math.round(state.index * 100 / state.words.length)}%"></i></div></div></footer></div>`;
  document.querySelector('.study-card').insertAdjacentHTML('beforeend', `<div class="word-marks">${state.mode==='match'?'<p class="mark-target" id="mark-target" role="status"></p>':''}${[['favorite','星标'],['fuzzy','模糊'],['unknown','不认识']].map(([key,label])=>`<button class="icon-btn" data-mark="${key}">${label}</button>`).join('')}</div>`);
  document.querySelector('.study-card').insertAdjacentHTML('beforeend',keyboardHints());
  syncWordMarks();
  bindStudy(word, opts);
}
function renderAlternativeMode(word, action) {
  if (state.mode === 'flash') return `<div class="study-card"><div class="badge">单词快过 · ${state.index + 1}/${state.words.length}</div><h1 class="word-title">${esc(word.word)} <button class="audio-btn" id="audio">🔊</button></h1><p class="word-phonetic">${esc(word.phonetic || '')}</p><div id="flash-answer" class="muted" style="min-height:60px;margin-top:22px">点击显示释义</div><div class="study-actions"><button class="btn" id="prev" ${state.index===0?'disabled':''}>上一词</button><button class="btn" id="show-answer" aria-expanded="false">显示释义</button><button class="btn primary" id="know">认识</button><button class="btn" id="unknown">不认识</button><button class="btn" id="browse-next">下一词</button><button class="btn" id="finish">结束测试</button></div></div>`;
  if (state.mode === 'write') return `<div class="study-card"><div class="badge">写出英文 · ${state.index + 1}/${state.words.length}</div><h1 class="word-title" style="font-size:32px">${esc(word.meaning)}</h1><p class="word-phonetic">${esc(word.example_cn || '')}</p><div class="field" style="max-width:560px;margin:24px auto 0"><input id="write-answer" placeholder="输入英文单词" autocomplete="off"/></div><div id="write-result" class="muted" style="min-height:26px"></div><div class="study-actions"><button class="btn" id="write-hint">提示</button><button class="btn primary" id="check-write">检查</button><button class="btn primary" id="next" disabled>下一个</button><button class="btn" id="skip">跳过</button><button class="btn" id="finish">结束测试</button></div></div>`;
  const pairs=state.words.slice(state.index,state.index+4);state.matchPairs=pairs;state.matchMarkId=null;
  return `<div class="study-card"><div class="badge">单词对对碰 · ${state.index+1}/${state.words.length}</div><h1 style="font-size:24px">把英文和释义配对</h1><p class="muted">先选左侧单词，再选右侧释义。</p><div class="match-board"><div>${shuffled(pairs).map(w=>`<button class="option match-tile" data-left="${w.id}">${esc(w.word)}</button>`).join('')}</div><div>${shuffled(pairs).map(w=>`<button class="option match-tile" data-right="${w.id}">${esc(w.meaning)}</button>`).join('')}</div></div><div class="study-actions"><button class="btn" id="skip">跳过这组</button><button class="btn" id="finish">结束测试</button></div></div>`;
}
function speak(word){if('speechSynthesis' in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(word);utterance.lang='en-US';const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('en') && v.localService);if(voice)utterance.voice=voice;speechSynthesis.speak(utterance);}else showToast('当前浏览器不支持发音');}
function bindWordMarks(){document.querySelectorAll('[data-mark]').forEach(b=>b.onclick=async()=>{const target=markWord();if(!target || actionSaves.has(String(target.id)))return;try{await act(target,b.dataset.mark);}catch(error){showToast('标记保存失败：'+error.message);}});}
function bindStudy(word,opts){
  document.getElementById('audio')?.addEventListener('click',()=>speak(word.word));
  bindWordMarks();
  document.getElementById('finish')?.addEventListener('click',()=>{if(!state.busy)finishStudy();});
  const next=()=>{if(state.busy || !document.querySelector('.study-card'))return;state.index+=state.mode==='match'?state.matchPairs.length:1;state.answered=false;state.busy=false;state.selected=null;renderStudyPage();};
  document.getElementById('skip')?.addEventListener('click',()=>{if(!state.busy)next();});
  document.getElementById('next')?.addEventListener('click',next);
  if(state.mode==='meaning')document.querySelectorAll('[data-option]').forEach((b,i)=>b.onclick=async()=>{if(state.answered)return;state.answered=true;const ok=opts[i]===word.meaning;document.querySelectorAll('[data-option]').forEach((x,j)=>{x.disabled=true;if(opts[j]===word.meaning)x.classList.add('correct');});if(!ok)b.classList.add('wrong');await answer(word,ok);document.getElementById('next').disabled=false;});
  if(state.mode==='flash'){
    let revealed=false;
    document.getElementById('show-answer').onclick=()=>{
      revealed=!revealed;
      document.getElementById('flash-answer').innerHTML=revealed ? `<strong>${esc(word.meaning)}</strong><p>${esc(word.example_en || '')}</p><p>${esc(word.example_cn || '')}</p>` : '点击显示释义';
      const button=document.getElementById('show-answer');button.textContent=revealed?'隐藏释义':'显示释义';button.setAttribute('aria-expanded',String(revealed));
    };
    document.getElementById('prev').onclick=()=>{if(state.busy || state.index===0)return;state.index--;renderStudyPage();};
    document.getElementById('browse-next').onclick=async()=>{
      if(state.busy)return;state.busy=true;state.studied.add(word.id);
      try{await recordProgress(word);}catch(error){showToast('进度保存失败：'+error.message);return;}finally{state.busy=false;}
      next();
    };
    for(const [id,ok] of [['know',true],['unknown',false]]) document.getElementById(id).onclick=async()=>{if(state.busy)return;state.busy=true;await answer(word,ok);next();};
  }
  if(state.mode==='write'){
    let hintIndex=0;
    document.getElementById('write-hint').onclick=()=>{
      if(state.answered || state.busy)return;
      const input=document.getElementById('write-answer');
      input.value=word.word.slice(0,++hintIndex);input.focus();input.setSelectionRange(input.value.length,input.value.length);
      document.getElementById('write-hint').disabled=hintIndex>=word.word.length;
    };
    document.getElementById('write-answer').focus();
  }
  if(state.mode==='write')document.getElementById('check-write').onclick=async()=>{if(state.answered)return;const input=document.getElementById('write-answer');if(!input.value.trim()){showToast('请输入英文单词');return;}state.answered=true;document.getElementById('write-hint').disabled=true;const ok=input.value.trim().toLowerCase()===word.word.toLowerCase();input.disabled=true;document.getElementById('check-write').disabled=true;document.getElementById('write-result').textContent=ok?'回答正确':'正确答案：'+word.word;await answer(word,ok);document.getElementById('next').disabled=false;};
  if(state.mode==='match'){
    const done=new Set();let hadError=false;
    document.querySelectorAll('[data-left]').forEach(b=>b.onclick=()=>{if(state.busy)return;document.querySelectorAll('[data-left]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.selected=b.dataset.left;state.matchMarkId=b.dataset.left;syncWordMarks();});
    document.querySelectorAll('[data-right]').forEach(b=>b.onclick=async()=>{if(!state.selected || state.busy)return;state.busy=true;const id=state.selected,left=document.querySelector(`[data-left="${id}"]`);if(id!==b.dataset.right){hadError=true;b.classList.add('wrong');showToast('还不匹配，再试一次');setTimeout(()=>b.classList.remove('wrong'),600);state.busy=false;return;}const matched=state.matchPairs.find(w=>String(w.id)===id);left.disabled=true;b.disabled=true;left.classList.add('correct');b.classList.add('correct');await answer(matched,!hadError);hadError=false;done.add(id);state.selected=null;state.busy=false;if(done.size===state.matchPairs.length)next();});
  }
  bindStudyKeyboard();
}

function flashKnownReview(){return state.review && ['fuzzy','unknown'].includes(state.review.filter);}
function keyboardHints(){
  const hints=state.mode==='flash' ? [
    ['← / →','上一词 / 下一词'],['空格键','翻转'],['R','重读'],
    ...(flashKnownReview() ? [['1','认识']] : [['1','模糊'],['2','不认识'],['3','星标']])
  ] : state.mode==='write' ? [['空格键','提示（每次一个字母）'],['Enter','提交答案 / 答题后下一词']] : state.mode==='meaning' ? [['Enter','答题后下一词']] : [];
  return hints.length ? `<div class="keyboard-hints" role="group" aria-label="快捷键"><p>⌨ 快捷键</p>${hints.map(([key,label])=>`<span><kbd>${key}</kbd><span>${label}</span></span>`).join('')}</div>` : '';
}
function bindStudyKeyboard(){
  document.onkeydown=e=>{
    if(e.defaultPrevented || e.isComposing || e.keyCode===229 || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !document.querySelector('.study-card'))return;
    const target=e.target instanceof Element ? e.target : null;
    if(target?.isContentEditable || target?.closest('[role="dialog"], [aria-modal="true"]'))return;
    const typing=target?.closest('input, textarea, select');
    const writing=state.mode==='write' && target?.id==='write-answer';
    if(typing && !writing)return;
    const interactive=target?.closest('button, a, [role="button"]');
    let selector;
    if(state.mode==='flash'){
      if(e.key==='ArrowLeft')selector='#prev';
      else if(e.key==='ArrowRight')selector='#browse-next';
      else if(e.key===' ' && (!interactive || ['prev','browse-next'].includes(interactive.id)))selector='#show-answer';
      else if(e.key.toLowerCase()==='r')selector='#audio';
      else if(flashKnownReview()){if(e.key==='1')selector='#know';}
      else {const mark={'1':'fuzzy','2':'unknown','3':'favorite'}[e.key];if(mark)selector=`[data-mark="${mark}"]`;}
    }else if(state.mode==='write' && !interactive){
      if(e.key===' ' || e.code==='Space')selector='#write-hint';
      else if(e.key==='Enter')selector=state.answered?'#next':'#check-write';
    }else if(state.mode==='meaning' && e.key==='Enter' && (!interactive || interactive.matches('[data-option]'))){
      selector='#next';
    }
    if(!selector)return;
    // Prevent native activation/scroll even while a held key or save is ignored.
    e.preventDefault();
    if(e.repeat || state.busy)return;
    const button=document.querySelector(selector);
    if(button && !button.disabled){
      if(interactive && ['prev','browse-next'].includes(interactive.id))interactive.blur();
      button.click();
    }
  };
}
function finishStudy() { document.onkeydown=null;app.innerHTML = layout(`<main class="page shell"><div class="form-panel panel" style="text-align:center"><div class="eyebrow">SESSION COMPLETE</div><h1>本轮练习完成</h1><p class="muted">正确 ${state.correct} 题，错误 ${state.wrong} 题，正确率 ${state.correct + state.wrong ? Math.round(state.correct * 100 / (state.correct + state.wrong)) : 0}%</p><div class="hero-actions" style="justify-content:center;margin-top:22px"><a class="btn primary" href="${modeHref(state.mode,state.courseId,state.unitId,state.review)}">再练一次</a><a class="btn" href="${state.review ? notesHref(state.review.filter) : '/courseDetail.html?course_id='+state.courseId}">${state.review?'返回重点单词':'返回单元列表'}</a></div></div></main>`); bindGlobal(); }
async function study(mode) { state.mode = mode; await loadWords(); renderStudyPage(); }

async function wordSearch() { const query = qs.get('q') || ''; const results = query ? await api(`/api/search?q=${encodeURIComponent(query)}`) : []; app.innerHTML = layout(`<main class="search-page"><h1>搜索单词</h1><p class="hint">从英文单词或中文释义出发，找到释义、例句和自己的笔记。</p><form class="search-controls" id="search-form"><input id="search-input" value="${esc(query)}" placeholder="输入英文单词或中文释义" autofocus/><button class="btn primary">搜索</button></form><p class="muted" style="margin-top:18px">${query ? `找到 ${results.length} 条结果` : '请输入关键词开始搜索'}</p><div id="results">${results.map(w => `<article class="search-result"><div><h3>${esc(w.word)} <small class="muted">${esc(w.phonetic || '')}</small></h3><p>${esc(w.meaning)} · ${esc(w.pos || '')}</p><p>${esc(w.example_en || '')}</p><p>${esc(w.example_cn || '')}</p></div><div class="result-actions"><button class="icon-btn" data-speak="${esc(w.word)}">🔊</button><a class="icon-btn" href="/englishToMeaning.html?course_id=${w.course_id}&unit_id=${w.unit_id}">练习</a></div></article>`).join('') || (query ? '<div class="empty">没有找到匹配的词条</div>' : '')}</div></main>`, { title: '搜索单词 · 枫叶单词' }); bindGlobal(); document.getElementById('search-form').onsubmit = e => { e.preventDefault(); location.href = `/wordSearch.html?q=${encodeURIComponent(document.getElementById('search-input').value)}`; }; document.querySelectorAll('[data-speak]').forEach(b => b.onclick = () => speak(b.dataset.speak)); }

async function notes(filter=qs.get('filter')) {
  const [books,actions]=await Promise.all([api('/api/user/books'),api('/api/word-actions')]);
  let activeFilter=reviewFilter(filter);
  app.innerHTML=layout(`<main class="page shell"><div class="hero"><div><div class="eyebrow">MY WORDS</div><h1>我的笔记与词库</h1><p>按标记整理重点单词，查看详情或开始一轮复习。</p></div><button class="btn primary" id="new-book">新建词书</button></div><div class="content-grid notes-grid"><section class="panel notes-panel"><div class="section-head notes-heading"><h2>重点单词</h2><span id="notes-count" role="status"></span></div><div class="notes-filters" role="group" aria-label="筛选重点单词">${markFilters.map(([key,label])=>`<button class="filter-btn" data-filter="${key}" aria-pressed="false">${label} <span>${markedActions(actions,key).length}</span></button>`).join('')}</div><div id="notes-results"></div></section><aside class="panel"><h2>我的词书</h2>${books.length ? books.map(b=>`<div class="note-card" style="padding:15px;margin:10px 0"><strong>${esc(b.name)}</strong><p class="muted">${b.words.length} 个单词 · ${new Date(b.createdAt).toLocaleDateString()}</p></div>`).join('') : '<div class="empty">还没有自制词书，点击右上角创建一本。</div>'}<p class="muted">同一单词可以有多个标记；「全部」中每条词条只显示一次。</p></aside></div></main>`,{title:'我的笔记 · 枫叶单词'});
  function renderList(){
    const marked=markedActions(actions,activeFilter);
    document.getElementById('notes-count').textContent=`${filterLabel(activeFilter)} · ${marked.length} 词`;
    document.querySelectorAll('[data-filter]').forEach(b=>{const active=b.dataset.filter===activeFilter;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.getElementById('notes-results').innerHTML=`<div class="notes-practice"><strong>练习当前筛选 · ${filterLabel(activeFilter)}</strong><p class="muted">${marked.length ? `只练习下面这 ${marked.length} 个重点单词。` : '先在学习中添加相应标记，再回来开始练习。'}</p>${reviewLinks(activeFilter,marked.length>0)}</div>${marked.length ? `<table class="table notes-table"><thead><tr><th>单词 / 详情</th><th>释义</th><th>标记</th></tr></thead><tbody>${marked.map(a=>`<tr data-note-word="${a.word_id}"><td><a class="word-link" href="/wordDetail.html?word_id=${a.word_id}&filter=${activeFilter}"><strong>${esc(a.word.word)}</strong><small>查看详情 →</small></a><small class="muted note-phonetic">${esc(a.word.phonetic || '')}</small></td><td class="note-meaning">${esc(a.word.meaning)}</td><td><div class="note-tags">${markFilters.slice(1).filter(([key])=>a[key]).map(([,label])=>`<span>${label}</span>`).join('')}</div></td></tr>`).join('')}</tbody></table>` : `<div class="empty">${activeFilter==='all'?'还没有重点单词。练习时点击星标、模糊或不认识即可加入。':`还没有标记为「${filterLabel(activeFilter)}」的单词。`}</div>`}`;
    bindReviewLinks(marked.map(a=>a.word),activeFilter);
  }
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;history.replaceState(null,'',notesHref(activeFilter));renderList();});
  document.getElementById('new-book').onclick=async()=>{const name=prompt('请输入词书名称');if(!name)return;await api('/api/user/books',{method:'POST',body:JSON.stringify({name,words:[]})});showToast('词书已创建');await notes(activeFilter);};
  renderList();bindGlobal();
}

async function wordDetail(){
  const filter=reviewFilter(qs.get('filter')),id=Number(qs.get('word_id'));let word;
  try{word=await api('/api/words/'+(Number.isSafeInteger(id) && id>0 ? id : 0));}catch(error){if(error.status!==404)throw error;app.innerHTML=layout(`<main class="page shell"><div class="panel empty">${esc(error.message)}<br><a href="${notesHref(filter)}">返回重点单词</a></div></main>`);bindGlobal();return;}
  const [actions,courses]=await Promise.all([api('/api/word-actions'),getCourses()]);
  state.actions=Object.fromEntries(actions.map(a=>[String(a.word_id),a]));state.words=[word];state.index=0;state.courseId=word.course_id;state.unitId=word.unit_id;
  const course=courses.find(c=>c.id===word.course_id),unit=course?.units.find(u=>u.id===word.unit_id);
  app.innerHTML=layout(`<main class="page shell word-detail-page"><a class="detail-back" href="${notesHref(filter)}">← 返回重点单词 · ${filterLabel(filter)}</a><article class="panel word-detail"><div class="eyebrow">单词详情</div><h1 class="word-title">${esc(word.word)} <button class="audio-btn" id="detail-audio" aria-label="播放单词发音">🔊</button></h1><p class="word-phonetic">${esc(word.phonetic || '暂无音标')}</p><p class="word-pos">${esc(word.pos || '')}</p><p class="detail-meaning">${esc(word.meaning)}</p><section class="word-example"><h2>例句</h2>${word.example_en || word.example_cn ? `<p lang="en">${esc(word.example_en || '')}</p><p class="muted">${esc(word.example_cn || '')}</p>` : '<p class="muted">此词暂未收录例句。</p>'}</section><div class="detail-source"><span>所属词书</span><a href="/courseDetail.html?course_id=${word.course_id}">${esc(course?.title || '本地词书')}</a><a href="${modeHref('meaning',word.course_id,word.unit_id)}">${esc(unit?.title || '所在单元')} →</a></div><div class="word-marks">${markFilters.slice(1).map(([key,label])=>`<button class="icon-btn" data-mark="${key}">${label}</button>`).join('')}</div></article><section class="panel detail-practice"><h2>练习这个单词</h2>${reviewLinks(filter,true)}</section></main>`,{title:word.word+' · 单词详情'});
  document.getElementById('detail-audio').onclick=()=>speak(word.word);syncWordMarks();bindWordMarks();bindReviewLinks([word],filter);bindGlobal();
}

async function stats() { const dashboard = await api('/api/dashboard'); app.innerHTML = layout(`<main class="page shell"><div class="hero"><div><div class="eyebrow">LEARNING STATS</div><h1>学习统计</h1><p>查看本地学习记录，掌握自己的复习节奏。</p></div></div><section class="stats-grid grid"><div class="stat-card"><span>连续学习</span><strong>${dashboard.streak} 天</strong></div><div class="stat-card"><span>练习词数</span><strong>${dashboard.learned}</strong></div><div class="stat-card"><span>星标词</span><strong>${dashboard.favorite}</strong></div><div class="stat-card"><span>待复习词</span><strong>${dashboard.fuzzy + dashboard.unknown}</strong></div></section><section class="panel"><h2>学习建议</h2><p class="muted">每天完成一个单元，遇到不确定的词使用“跳过”后加入复习列表；下一轮可以切换到单词快过或写出英文模式。</p><div class="hero-actions" style="margin-top:18px"><a class="btn primary" href="/">选择今日词书</a><a class="btn" href="/myNotes.html">查看我的词库</a></div></section></main>`, { title: '学习统计 · 枫叶单词' }); bindGlobal(); }

function settings() { app.innerHTML = layout(`<main class="page shell"><div class="form-panel panel"><div class="eyebrow">SETTINGS</div><h1>设置</h1><div class="field"><label>显示名称</label><input id="display-name" placeholder="本地学习者"/></div><div class="field"><label>默认学习模式</label><select id="default-mode"><option value="meaning">英文选义</option><option value="flash">单词快过</option><option value="write">写出英文</option><option value="match">单词对对碰</option></select></div><div class="field"><label>语音</label><button class="btn" id="test-speech">播放示例发音</button></div><button class="btn primary" id="save-settings">保存设置</button><p class="auth-switch" id="settings-message"></p></div></main>`, { title: '设置 · 枫叶单词' }); bindGlobal(); document.getElementById('test-speech').onclick = () => speak('vocabulary'); document.getElementById('save-settings').onclick = () => { localStorage.setItem('beidanci-settings', JSON.stringify({ name: document.getElementById('display-name').value, mode: document.getElementById('default-mode').value })); document.getElementById('settings-message').textContent = '设置已保存'; showToast('设置已保存'); }; }
function auth() { app.innerHTML = layout(`<main class="page shell"><div class="form-panel panel"><div class="eyebrow">LOCAL ACCOUNT</div><h1>登录本地账户</h1><p class="muted">本地模式可直接学习，也可以创建账户把记录分开保存。</p><div class="field"><label>用户名</label><input id="username" autocomplete="username"/></div><div class="field"><label>密码</label><input id="password" type="password" autocomplete="current-password"/></div><p id="auth-error" class="muted"></p><div class="hero-actions"><button class="btn primary" id="login">登录</button><button class="btn" id="register">注册</button></div><a class="auth-switch" href="/">返回首页</a></div></main>`, { title: '登录 · 枫叶单词' }); bindGlobal(); async function submit(path){ try{ const b = await api(path, { method:'POST', body:JSON.stringify({ username:document.getElementById('username').value.trim(), password:document.getElementById('password').value }) }); localStorage.setItem(userKey, b.user.id); showToast('操作成功'); setTimeout(() => location.href='/', 300); } catch(e){ document.getElementById('auth-error').textContent=e.message; } } document.getElementById('login').onclick = () => submit('/api/auth/login'); document.getElementById('register').onclick = () => submit('/api/auth/register'); }

(async function boot(){ try { const path = location.pathname; if (path === '/' || path === '/index.html') return await home(); if (path === '/membership.html') { const target = qs.get('return_to'); location.replace(target || '/'); return; } if (path === '/library.html') return await library(); if (path === '/courseDetail.html') return await courseDetail(); if (path === '/englishToMeaning.html') return await study('meaning'); if (path === '/flashCard.html') return await study('flash'); if (path === '/writeItInEnglish.html') return await study('write'); if (path === '/wordMatchGame.html') return await study('match'); if (path === '/wordSearch.html') return await wordSearch(); if (path === '/myNotes.html') return await notes(); if (path === '/wordDetail.html') return await wordDetail(); if (path === '/learningStats.html') return await stats(); if (path === '/settings.html' || path === '/login.html') return path === '/login.html' ? auth() : settings(); return await home(); } catch (e) { app.innerHTML = layout(`<main class="page shell"><div class="panel empty">页面加载失败：${esc(e.message)}<br/><a href="/">返回首页</a></div></main>`); } })();



window.addEventListener("unhandledrejection",e=>{showToast(e.reason?.message || "操作失败，请重试");});
