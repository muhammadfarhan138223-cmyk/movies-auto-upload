import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig,dataFile,root } from './config.mjs';
import { UploadQueue } from './queue.mjs';
import { startRemoteGateway } from './remote-gateway.mjs';
const config=loadConfig();
const queue=await new UploadQueue(config,dataFile).init();
const base=path.join(root,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const csp="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'";
function send(res,code,data,type='application/json; charset=utf-8'){
 const text=typeof data==='string'?data:JSON.stringify(data);
 res.writeHead(code,{'Content-Type':type,'Content-Length':Buffer.byteLength(text),'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Content-Security-Policy':csp,'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});
 res.end(text);
}
async function readJson(req){let size=0;const chunks=[];
 for await(const ch of req){size+=ch.length;if(size>16*1024)throw new Error('Request too large');chunks.push(ch);}
 return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function csvSafe(v){let text=String(v??'');if(/^[\s]*[=+@\-]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';}
const allowedHosts=new Set([`127.0.0.1:${config.port}`,`localhost:${config.port}`]);
const allowedOrigins=new Set([...allowedHosts].map(x=>`http://${x}`));
const server=http.createServer(async(req,res)=>{
 const host=req.headers.host||'';
 if(!allowedHosts.has(host))return send(res,403,{error:'Local dashboard only'});
 if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))return send(res,403,{error:'Origin not allowed'});
 try{
  const u=new URL(req.url,`http://127.0.0.1:${config.port}`);
  if(req.method==='GET'&&u.pathname==='/api/state')return send(res,200,queue.publicState());
  if(req.method==='GET'&&u.pathname==='/api/export'){
   const csv=[['Filename','Provider','Status','File code','URL','Error'].join(','),...queue.jobs.map(j=>
    [j.name,j.provider,j.status,j.remoteId||'',j.url||'',j.error||''].map(csvSafe).join(','))].join('\r\n');
   return send(res,200,'\ufeff'+csv,'text/csv; charset=utf-8');
  }
  if(req.method==='POST'&&u.pathname.startsWith('/api/')){
   if(req.headers['x-moviehub-local']!=='1')return send(res,403,{error:'Local app header required'});
   const body=await readJson(req);let result={ok:true};
   switch(u.pathname){
    case '/api/add':result=await queue.add(body.folder,body.providers);break;
    case '/api/start':result=await queue.start();break;
    case '/api/pause':await queue.pause();break;
    case '/api/hold-job':result=await queue.holdJob(body.id);break;
    case '/api/resume-job':result=await queue.resumeJob(body.id);break;
    case '/api/prioritize-job':result=await queue.prioritizeJob(body.id);break;
    case '/api/remove-job':result=await queue.removeJob(body.id);break;
    case '/api/preview-remove-folder':result=queue.previewFolderRemoval(body.folder);break;
    case '/api/remove-folder':result=await queue.removeFolderJobs(body.folder,body.ids);break;
    case '/api/confirm-filemoon':result=await queue.confirmFileMoonSaved(body.id,body.url);break;
    case '/api/retry':await queue.reviewRetry(body.id);break;
    case '/api/clear':await queue.clearCompleted();break;
    case '/api/link':result=await queue.updateLink(body.id,body.url);break;
    case '/api/settings':result=await queue.setSettings(body);break;
    case '/api/cancel-shutdown':await queue.cancelShutdown();break;
    case '/api/sync':result={ok:await queue.syncStatus(),error:queue.sync.lastError};break;
    default:return send(res,404,{error:'Not found'});
   }return send(res,200,result);
  }
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
  const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
  if(!['index.html','app.js','style.css'].includes(name))return send(res,404,{error:'Not found'});
  const data=await fs.readFile(path.join(base,name));
  res.writeHead(200,{'Content-Type':mime[path.extname(name)],'Content-Length':data.length,
   'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);
 }catch(e){send(res,400,{error:e.message||'Unexpected error'});}
});
server.listen(config.port,'127.0.0.1',()=>{
 console.log(`MovieHub V2 local uploader running: http://127.0.0.1:${config.port}`);
 console.log('No video bytes or API credentials pass through Vercel.');
});
let remoteGateway=null;
void startRemoteGateway({upstreamPort:config.port}).then(s=>{remoteGateway=s;}).catch(e=>console.error('Remote gateway not started:',e.message));
async function stop(){await queue.close();server.close();remoteGateway?.close();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
