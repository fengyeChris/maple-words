const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = arg('base-url', '').replace(/\/$/, '');
const courseFilter = arg('course', '');
if (!baseUrl) {
  console.error('用法：node scripts/import-api.js --base-url https://你的数据服务 --course 4');
  process.exit(1);
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    const request = client.get(target, { headers: { Accept: 'application/json', 'User-Agent': 'beidanci365-local-importer/1.0' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if(Buffer.byteLength(body)>40*1024*1024) response.destroy(new Error('响应超过40MB')); });
      response.on('error',reject);
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${url} 返回 HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(new Error(`${url} 不是有效 JSON：${error.message}`)); }
      });
    });
    request.on('error', reject);
    request.setTimeout(30000,()=>request.destroy(new Error('下载超时')));
  });
}

async function main() {
  const {importPack,db}=require('../db');
  try {
  const courses = await requestJson(`${baseUrl}/api/courses`);
  const selected = courses.filter(course => !courseFilter || String(course.id) === String(courseFilter) || String(course.key) === String(courseFilter));
  if (!selected.length) throw new Error('没有匹配的词书');
  for (const course of selected) {
    const units = await requestJson(`${baseUrl}/api/courses/${encodeURIComponent(course.id)}/units`);
    const pack={schema:'wordbook/v1',book:{...course,key:'remote-'+crypto.createHash('sha256').update(baseUrl).digest('hex').slice(0,12)+'-'+course.id,source:baseUrl,source_url:baseUrl},units:[]};
    for (const unit of units) {
      const words = await requestJson(`${baseUrl}/api/courses/${encodeURIComponent(course.id)}/units/${encodeURIComponent(unit.id)}/words`);
      pack.units.push({key:String(unit.key || unit.id),title:unit.title,words:words.map(w=>({...w,key:String(w.external_key || w.id || w.word)}))});
    }
    console.log(JSON.stringify(importPack(pack)));
  }
  } finally { db.close(); }
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
