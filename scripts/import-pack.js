const fs=require('fs');
const files=process.argv.slice(2);
if(!files.length) { console.error('用法：node scripts/import-pack.js 词书.json [词书2.json]');process.exit(1); }
const content=require('../db');
try { for(const file of files) console.log(JSON.stringify(content.importPack(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))))); }
catch(e) { console.error(e.message);process.exitCode=1; }
finally {content.db.close();}
