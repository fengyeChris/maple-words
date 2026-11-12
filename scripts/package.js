const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const content = require('../db');
const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const name = `MapleWords-v${version}-windows-x64`;
const dest = path.join(root, 'outputs', 'releases', name);
const resources = fs.existsSync(path.join(root, 'resources')) ? path.join(root, 'resources') : path.join(root, 'outputs', 'resources');

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('请在 Windows x64 上使用与 better-sqlite3 匹配的 Node 运行时打包。');
  // Never overwrite a delivered copy that may contain learning data.
  if (fs.existsSync(dest)) throw new Error('发布目录已存在，请使用新版本号或先将已有发布目录另存：' + dest);
  fs.mkdirSync(dest, {recursive:true});
  for (const file of ['server.js', 'db.js', 'profiles.js', 'package.json', 'package-lock.json', 'README.md', 'RELEASE_NOTES.md', 'THIRD_PARTY_NOTICES.md', '使用说明.txt', '启动枫叶单词.cmd']) fs.copyFileSync(path.join(root, file), path.join(dest, file));
  for (const dir of ['public', 'scripts', 'tests', 'node_modules']) fs.cpSync(path.join(root, dir), path.join(dest, dir), {recursive:true});
  fs.mkdirSync(path.join(dest, 'data'), {recursive:true});
  for (const file of ['course-4.json', 'unit-154.json']) fs.copyFileSync(path.join(root, 'data', file), path.join(dest, 'data', file));
  const snapshot = path.join(dest, 'data', 'content.sqlite');
  await content.db.backup(snapshot);
  const verify = new (require('better-sqlite3'))(snapshot);
  verify.pragma('journal_mode = DELETE');
  if (verify.pragma('integrity_check', {simple:true}) !== 'ok') throw new Error('SQLite snapshot verification failed');
  verify.close();
  fs.writeFileSync(path.join(dest, 'data', 'state.json'), JSON.stringify({users:[], progress:{}, actions:{}, books:[]}));
  fs.mkdirSync(path.join(dest, 'runtime'), {recursive:true});
  fs.copyFileSync(process.execPath, path.join(dest, 'runtime', 'node.exe'));
  const nodeRoot = path.dirname(process.execPath);
  let license = ['LICENSE', 'LICENSE.txt'].map(f => path.join(nodeRoot, f)).find(f => fs.existsSync(f));
  if (!license && fs.existsSync(path.join(resources, 'runtime', 'Node-LICENSE'))) license = path.join(resources, 'runtime', 'Node-LICENSE');
  if (!license) throw new Error('缺少 Node.js 许可文件');
  fs.copyFileSync(license, path.join(dest, 'runtime', 'LICENSE'));
  for (const dir of ['ecdict', 'cet6-core']) {
    const target = path.join(dest, 'resources', dir);
    fs.mkdirSync(target, {recursive:true});
    for (const file of fs.readdirSync(path.join(resources, dir))) {
      if (file === 'ecdict.csv' || file === 'revision.json' || file === 'install-verification.json') continue;
      fs.copyFileSync(path.join(resources, dir, file), path.join(target, file));
    }
  }
  content.db.close();
  execFileSync(process.env.PYTHON || 'python', ['-c', 'import pathlib,zipfile,sys; r=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(r.parent/(r.name+".zip"),"w",zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(r.parent)) for p in sorted(r.rglob("*")) if p.is_file()]; z.close()', dest], {stdio:'inherit'});
  const zip = dest + '.zip';
  const hash = require('crypto').createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  fs.writeFileSync(zip + '.sha256', hash + '  ' + path.basename(zip) + '\n');
  console.log('Packaged ' + zip + '\nSHA256 ' + hash);
}
main().catch(e => {console.error(e); if (content.db.open) content.db.close(); process.exitCode = 1;});
