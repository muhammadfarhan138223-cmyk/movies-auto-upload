/**
 * MovieHub remote control gateway. Optional and disabled unless all REMOTE_* values
 * are present in the laptop's private .env. Designed for Cloudflare Access + Tunnel.
 * Does NOT publish or bind the uploader API to a network interface.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sleepNever=()=>{};
function err(message,status=403){const e=new Error(message);e.status=status;return e;}
function fromBase64Url(value){
  if(typeof value!=='string'||value.length>12000||!(/^[A-Za-z0-9_-]+$/.test(value)))throw err('Malformed Access token');
  return Buffer.from(value,'base64url');
}
function jsonPart(value){
  try{return JSON.parse(fromBase64Url(value).toString('utf8'));}catch{throw err('Malformed Access token');}
}
function accessSettings(raw){
  const domain=String(raw.REMOTE_ACCESS_TEAM_DOMAIN||'').trim().toLowerCase().replace(/^https:\/\//,'').replace(/\/$/,'');
  const host=String(raw.REMOTE_HOST||'autoupload.farhanbalouch.com').trim().toLowerCase();
  const audience=String(raw.REMOTE_ACCESS_AUD||'').trim();
  const email=String(raw.REMOTE_ACCESS_EMAIL||'').trim().toLowerCase();
  const port=Number(raw.REMOTE_PORT||8767);
  if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain))throw new Error('REMOTE_ACCESS_TEAM_DOMAIN must be yourteam.cloudflareaccess.com');
  if(!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host))throw new Error('REMOTE_HOST must be an HTTPS public hostname');
  if(!/^[a-f0-9]{32,128}$/i.test(audience))throw new Error('REMOTE_ACCESS_AUD must be the Cloudflare Access application AUD tag');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('REMOTE_ACCESS_EMAIL must be the authorized email');
  if(!Number.isInteger(port)||port<1024||port>65535||port===8766)throw new Error('REMOTE_PORT must be 1024-65535 and separate from uploader port');
  return {domain,host,audience,email,port};
}

export function makeAccessVerifier(config,{fetcher=fetch,clock=()=>Date.now()}={}){
  let cached=null,lastFetch=0;
  async function getKeys(refresh=false){
    if(!refresh&&cached&&clock()-lastFetch<30*60*1000)return cached;
    let response;
    try{response=await fetcher(`https://${config.domain}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(8000),redirect:'error'});}
    catch{throw err('Access verification service unavailable',503);}
    if(!response.ok)throw err('Unable to load Access signing keys',503);
    const data=await response.json().catch(()=>null);
    if(!data||!Array.isArray(data.keys)||!data.keys.length)throw err('Invalid Access key set',503);
    cached=data.keys;lastFetch=clock();return cached;
  }
  return async function verifyAssertion(token){
    if(typeof token!=='string'||token.length>14000)throw err('Missing Access JWT');
    const parts=token.split('.');
    if(parts.length!==3)throw err('Invalid Access JWT');
    const header=jsonPart(parts[0]),payload=jsonPart(parts[1]);
    if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200)throw err('Unsupported Access JWT');
    const now=Math.floor(clock()/1000);
    if(payload.iss!==`https://${config.domain}`||
      !(Array.isArray(payload.aud)?payload.aud.includes(config.audience):payload.aud===config.audience)||
      typeof payload.exp!=='number'||payload.exp<=now-30||
      (typeof payload.nbf==='number'&&payload.nbf>now+30)||
      typeof payload.email!=='string'||payload.email.toLowerCase()!==config.email){
      throw err('Access token is not authorized for this application');
    }
    let keys=await getKeys();
    let jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');
    if(!jwk){keys=await getKeys(true);jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');}
    if(!jwk)throw err('Unknown Access signing key');
    let good=false;
    try{good=cryptoVerify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),fromBase64Url(parts[2]));}
    catch{throw err('Invalid Access signature');}
    if(!good)throw err('Invalid Access signature');
    return {email:payload.email,sub:payload.sub||''};
  };
}

const allowedPostPaths=new Set(['/api/add','/api/start','/api/pause','/api/hold-job','/api/resume-job',
  '/api/prioritize-job','/api/remove-job','/api/preview-remove-folder','/api/remove-folder',
  '/api/retry','/api/clear','/api/link','/api/settings','/api/cancel-shutdown']);
const staticTypes={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/style.css':'text/css; charset=utf-8',
  '/app.js':'application/javascript; charset=utf-8','/remote-install.js':'application/javascript; charset=utf-8',
  '/remote-sw.js':'application/javascript; charset=utf-8','/manifest.webmanifest':'application/manifest+json; charset=utf-8',
  '/offline.html':'text/html; charset=utf-8','/icons/icon-192.png':'image/png','/icons/icon-512.png':'image/png',
  '/icons/icon-maskable.png':'image/png'};
const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function respond(res,status,body,contentType='text/plain; charset=utf-8'){
  const b=Buffer.isBuffer(body)?body:Buffer.from(String(body));
  res.writeHead(status,{...headers,'Content-Type':contentType,'Content-Length':b.length});res.end(b);
}
function publicManifest(){return JSON.stringify({name:'MovieHub Upload Control',short_name:'MovieHub Upload',description:'Private remote queue controls for your own laptop uploader',
  start_url:'/',scope:'/',display:'standalone',background_color:'#090b10',theme_color:'#e41127',
  icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'},
    {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png'},
    {src:'/icons/icon-maskable.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]});}
function remoteUi(html){return html.replace('</head>',
  '<meta name="theme-color" content="#e41127"><link rel="manifest" href="/manifest.webmanifest"><script src="/remote-install.js" defer></script></head>')
  .replace('LOCAL-FIRST OVERNIGHT UPLOADING','CLOUDFLARE ACCESS PROTECTED REMOTE CONTROL')
  .replace('Mobile monitoring is optional and read-only.','You can manage the laptop queue here. The laptop and uploader must remain online.')
  .replace('UPLOAD CONTROL CENTER • V2.2 · 4 HOSTS','SECURE REMOTE CONTROL • 4 HOSTS')
  .replace('Read-only Supabase sync; never exposes the local server to the internet.','Remote control uses Cloudflare Access; Supabase is not required.');}

export function createRemoteGateway({config,projectDir=projectRoot,upstreamPort=8766,
    verifyAssertion=makeAccessVerifier(config),fetcher=fetch}={}){
  if(!config?.host||!config?.email||!config?.audience)throw new Error('Remote config required');
  return http.createServer(async(req,res)=>{
    if(req.headers.host?.toLowerCase()!==config.host)return respond(res,403,'Wrong Host');
    const reqUrl=new URL(req.url,`https://${config.host}`);
    const pathname=reqUrl.pathname;
    if(reqUrl.search)return respond(res,404,'Not found');
    try{
      await verifyAssertion(req.headers['cf-access-jwt-assertion']);
    }catch(e){return respond(res,e.status||403,e.status===503?'Authentication temporarily unavailable':'Access denied');}
    if(!['GET','POST'].includes(req.method))return respond(res,405,'Method not allowed');
    if(req.method==='POST'){
      const origin=req.headers.origin;
      if(origin!==`https://${config.host}`)return respond(res,403,'Origin not allowed');
      if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return respond(res,403,'Cross-site request blocked');
      if(req.headers['x-moviehub-local']!=='1')return respond(res,403,'Missing UI request header');
      if(!allowedPostPaths.has(pathname))return respond(res,404,'Not found');
    }
    if(pathname.startsWith('/api/')){
      if(req.method==='GET'&&!['/api/state','/api/export'].includes(pathname))return respond(res,404,'Not found');
      let body;
      if(req.method==='POST'){
        const chunks=[];let len=0;
        try{for await(const part of req){len+=part.length;if(len>16*1024)return respond(res,413,'Request too large');chunks.push(part);}body=Buffer.concat(chunks);}
        catch{return respond(res,400,'Invalid body');}
      }
      let upstream;
      try{upstream=await fetcher(`http://127.0.0.1:${upstreamPort}${pathname}`,{
        method:req.method,headers:req.method==='POST'?{'Content-Type':'application/json','X-MovieHub-Local':'1'}:{},
        body,signal:AbortSignal.timeout(60000),redirect:'error'});}
      catch{return respond(res,503,'Laptop uploader is unavailable');}
      const output=Buffer.from(await upstream.arrayBuffer());
      if(output.length>6*1024*1024)return respond(res,502,'Response too large');
      return respond(res,upstream.status,output,upstream.headers.get('content-type')||'application/json; charset=utf-8');
    }
    if(req.method!=='GET'||!Object.hasOwn(staticTypes,pathname))return respond(res,404,'Not found');
    if(pathname==='/manifest.webmanifest')return respond(res,200,publicManifest(),staticTypes[pathname]);
    const asset=pathname==='/'?'/index.html':pathname;
    let file;
    if(asset==='/index.html'||asset==='/style.css'||asset==='/app.js')file=path.join(projectDir,'public',asset.slice(1));
    else if(asset.startsWith('/icons/'))file=path.join(projectDir,'mobile',asset.slice(1));
    else file=path.join(projectDir,'remote',asset.slice(1));
    try{
      let data=await fs.readFile(file);
      if(asset==='/index.html')data=Buffer.from(remoteUi(data.toString('utf8')));
      if(asset==='/style.css')data=Buffer.from(data.toString('utf8')+'\n@media(max-width:850px){.job-actions{min-width:220px}.stats b{font-size:25px}}\n.panel:has(#syncNow){display:none}\n');
      return respond(res,200,data,staticTypes[pathname]);
    }catch{return respond(res,404,'Asset unavailable');}
  });
}

async function readPrivateEnv(dir){
  let content='';try{content=await fs.readFile(path.join(dir,'.env'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const values={...process.env};
  for(const line of content.split(/\r?\n/)){
    const m=line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if(m){let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);values[m[1]]=v;}
  }
  return values;
}
export async function startRemoteGateway({projectDir=projectRoot,upstreamPort=8766}={}){
  const raw=await readPrivateEnv(projectDir);
  if(raw.REMOTE_ENABLED!=='1'){
    console.log('Remote gateway disabled (REMOTE_ENABLED=1 enables it after Cloudflare Access setup).');return null;
  }
  const config=accessSettings(raw);
  const server=createRemoteGateway({config,projectDir,upstreamPort});
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(config.port,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
  console.log(`Remote gateway bound to 127.0.0.1:${config.port} for ${config.host} (verified Cloudflare Access JWT only).`);
  return server;
}

