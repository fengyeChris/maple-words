const http=require('http');
const {spawn,execFile}=require('child_process');
const path=require('path');
const port=Number(process.env.PORT || 5173),url=`http://127.0.0.1:${port}`;
function open(){if(process.platform==='win32')execFile('cmd.exe',['/d','/c','start','',url],{windowsHide:true},e=>{if(e)console.log('请在浏览器打开 '+url);});else console.log('请在浏览器打开 '+url);}
function existing(){return new Promise(resolve=>{const req=http.get(url+'/api/courses',res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{resolve(res.statusCode===200 && Array.isArray(JSON.parse(text)));}catch{resolve(false);}});});req.on('error',()=>resolve(false));req.setTimeout(1200,()=>{req.destroy();resolve(false);});});}
(async()=>{
 if(await existing()){console.log('本地学习服务已在运行，正在打开。');open();return;}
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:process.env,stdio:['inherit','pipe','inherit']});let opened=false;
 child.stdout.on('data',data=>{process.stdout.write(data);if(!opened && data.toString().includes('运行于')){opened=true;open();}});
 child.on('error',e=>{console.error(e.message);process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code || 0;});
 process.on('SIGINT',()=>{child.kill();process.exit();});process.on('SIGTERM',()=>{child.kill();process.exit();});process.on('exit',()=>child.kill());
})();
