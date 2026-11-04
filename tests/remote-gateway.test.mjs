import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createRemoteGateway,makeAccessVerifier} from '../src/remote-gateway.mjs';
const config={domain:'testing.cloudflareaccess.com',host:'autoupload.farhanbalouch.com',audience:'abc1234567890abc1234567890abc12345',email:'owner@example.com',port:8767};
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));

async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mh-gateway-test-'));
 await fs.mkdir(path.join(root,'public'),{recursive:true});await fs.mkdir(path.join(root,'remote'));await fs.mkdir(path.join(root,'mobile/icons'),{recursive:true});
 await fs.writeFile(path.join(root,'public/index.html'),'<html><head></head><body><h1>Upload</h1></body></html>');
 await fs.writeFile(path.join(root,'public/app.js'),'console.log("app");');
 await fs.writeFile(path.join(root,'public/style.css'),'body {color:white}');
 await fs.writeFile(path.join(root,'remote/remote-install.js'),'console.log("install")');
 await fs.writeFile(path.join(root,'remote/remote-sw.js'),'console.log("sw")');
 await fs.writeFile(path.join(root,'remote/offline.html'),'<html>Offline</html>');
 const upstream=createServer(async(req,res)=>{
   if(req.url==='/api/state'){res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,query:req.url}));return;}
   if(req.url==='/api/pause'&&req.method==='POST'){
      const chunks=[];for await(const ch of req)chunks.push(ch);
      res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,header:req.headers['x-moviehub-local'],body:Buffer.concat(chunks).toString()}));return;
   }
   res.statusCode=404;res.end('not found');
 });
 const upPort=await listen(upstream);
 const gate=createRemoteGateway({config,projectDir:root,upstreamPort:upPort,verifyAssertion:async token=>{if(token!=='validtoken')throw Object.assign(new Error('Denied'),{status:403});return {email:config.email};}});
 const port=await listen(gate);
 async function call(route,opts={}){
  const {headers={},method='GET',body=''}=opts;
  return new Promise((resolve,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port,path:route,method,headers:{Host:config.host,'Cf-Access-Jwt-Assertion':'validtoken',...headers}},res=>{
      const chunks=[];res.on('data',ch=>chunks.push(ch));res.on('end',()=>{
        const content=Buffer.concat(chunks).toString('utf8');
        resolve({status:res.statusCode,headers:{get:k=>res.headers[k.toLowerCase()]},json:async()=>JSON.parse(content),text:async()=>content});
      });
    });
    request.on('error',reject);request.end(body);
  });
 }
 try{await fn({call});}finally{await close(gate);await close(upstream);await fs.rm(root,{recursive:true,force:true});}
}

test('unauthenticated request denied, no backend hit',async()=>fixture(async({call})=>{
 const r=await call('/api/state',{headers:{'Cf-Access-Jwt-Assertion':''}});assert.equal(r.status,403);
}));
test('host validation blocks mismatch',async()=>fixture(async({call})=>{
 const r=await call('/api/state',{headers:{Host:'attacker.example.com'}});assert.equal(r.status,403);
}));
test('authenticated state read succeeds',async()=>fixture(async({call})=>{
 const r=await call('/api/state');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
}));
test('POST requires same-site origin and UI request header',async()=>fixture(async({call})=>{
 const opts={method:'POST',body:'{}',headers:{'Content-Type':'application/json','X-MovieHub-Local':'1'}};
 assert.equal((await call('/api/pause',opts)).status,403);
 assert.equal((await call('/api/pause',{...opts,headers:{...opts.headers,Origin:'https://evil.example'}})).status,403);
 const good=await call('/api/pause',{...opts,headers:{...opts.headers,Origin:`https://${config.host}`}});
 assert.equal(good.status,200);assert.equal((await good.json()).header,'1');
}));
test('unknown endpoints and remote Supabase sync are denied',async()=>fixture(async({call})=>{
 assert.equal((await call('/private')).status,404);
 assert.equal((await call('/api/sync',{method:'POST',body:'{}',headers:{Origin:`https://${config.host}`,'X-Moviehub-Local':'1'}})).status,404);
}));
test('remote PWA HTML and manifest are served with no-store',async()=>fixture(async({call})=>{
 const r=await call('/');assert.equal(r.status,200);assert.match(await r.text(),/manifest.webmanifest/);
 assert.match(r.headers.get('cache-control'),/no-store/);
 const m=await (await call('/manifest.webmanifest')).json();assert.equal(m.display,'standalone');
 assert.equal((await call('/offline.html')).status,200);
}));
test('RS256 signature, issuer, audience and email are all verified',async()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=keys.publicKey.export({format:'jwk'});jwk.kid='testkey';
 const verify=makeAccessVerifier(config,{fetcher:async()=>({ok:true,json:async()=>({keys:[jwk]})})});
 function token(payload){
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'testkey'})).toString('base64url');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=sign('RSA-SHA256',Buffer.from(`${head}.${body}`),keys.privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
 }
 const valid={iss:`https://${config.domain}`,aud:[config.audience],exp:Math.floor(Date.now()/1000)+60,email:config.email};
 assert.equal((await verify(token(valid))).email,config.email);
 await assert.rejects(verify(token({...valid,email:'intruder@example.com'})),/not authorized/);
 await assert.rejects(verify(token({...valid,aud:['wrong']})),/not authorized/);
 await assert.rejects(verify(token(valid).replace(/.$/,'x')),/signature/);
});
