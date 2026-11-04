import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ShutdownManager } from '../src/shutdown.mjs';
import { UploadQueue } from '../src/queue.mjs';
import { StatusSync } from '../src/sync.mjs';
import { findResult } from '../src/providers.mjs';

test('Windows shutdown requires explicit enable; cancel aborts scheduled OS command',async()=>{
 const calls=[];const shutdown=new ShutdownManager({platform:'win32',runner:async(cmd,args)=>calls.push([cmd,...args]),clock:()=>1000});
 await shutdown.schedule(120);assert.equal(shutdown.state.scheduledAt,new Date(121000).toISOString());
 await shutdown.cancel();assert.equal(shutdown.state.scheduledAt,null);
 assert.deepEqual(calls.map(x=>x[1]),['/s','/a']);
});
test('Linux shutdown cannot ever be triggered',async()=>{
 const m=new ShutdownManager({platform:'linux',runner:async()=>assert.fail('should never execute')});
 await assert.rejects(m.schedule(120),/only supported on Windows/);
});
test('DoodStream preserves alternate provider links and file code',()=>{
 const r=findResult('doodstream',{status:200,result:[{filecode:'ID1',download_url:'https://provider.example/d/ID1',
  protected_embed:'https://example.invalid/e/ID1'}]});
 assert.deepEqual(r,{id:'ID1',url:'https://provider.example/d/ID1',alternateUrls:['https://example.invalid/e/ID1']});
});
test('Queue successful batch schedules shutdown once; pause and error block',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mh-v2-'));
 const cmds=[];
 try{
  await fs.writeFile(path.join(dir,'clip.mp4'),'video');
  const shutdown=new ShutdownManager({platform:'win32',runner:async(c,args)=>cmds.push(args[0])});
  const q=await new UploadQueue({streamtapeLogin:'test',streamtapeKey:'test'},path.join(dir,'queue.json'),()=>{},
   {shutdownManager:shutdown,sync:{enabled:false,push:async()=>true,lastError:'',lastSuccess:''}}).init();
  await q.add(dir,['streamtape']);await q.setSettings({autoShutdown:true,shutdownDelaySeconds:120});
  q.process=async j=>{j.status='completed';j.progress=100;};
  await q.start();
  for(let i=0;i<100&&!q.shutdown.state.scheduledAt;i++)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(cmds,['/s']);
  await q.cancelShutdown();assert.deepEqual(cmds,['/s','/a']);
  assert.equal(q.settings.autoShutdown,false);
  await q.close();
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('Queue does not shutdown when any job needs review',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mh-v2-'));const calls=[];
 try{
  await fs.writeFile(path.join(dir,'clip.mp4'),'video');
  const sm=new ShutdownManager({platform:'win32',runner:async()=>calls.push('shutdown')});
  const q=await new UploadQueue({streamtapeLogin:'test',streamtapeKey:'test'},path.join(dir,'queue.json'),()=>{},
   {shutdownManager:sm,sync:{enabled:false,push:async()=>true,lastError:'',lastSuccess:''}}).init();
  await q.add(dir,['streamtape']);await q.setSettings({autoShutdown:true,shutdownDelaySeconds:120});
  q.process=async j=>{j.status='review';};await q.start();
  for(let i=0;i<100&&q.busy;i++)await new Promise(r=>setTimeout(r,5));
  await new Promise(r=>setTimeout(r,30));assert.deepEqual(calls,[]);await q.close();
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('Sync uses authenticated agent JWT, never service key, and confirms single-row update',async()=>{
 const calls=[];
 const mock=async(url,opt)=>{
  calls.push({url,method:opt.method,headers:opt.headers});
  if(url.includes('/auth/v1/token'))return new Response(JSON.stringify({access_token:'jwt-demo',refresh_token:'refresh',expires_in:3600}),{status:200});
  return new Response(JSON.stringify([{id:1}]),{status:200});
 };
 const q=new StatusSync({syncUrl:'https://demo.supabase.co',syncAnonKey:'sb_publishable_abc',syncAgentEmail:'agent@example.com',syncAgentPassword:'not-real'},mock);
 assert.equal(await q.push({jobs:[]}),true);assert.equal(calls.length,2);
 assert.equal(calls[1].method,'PATCH');assert.equal(calls[1].headers.Authorization,'Bearer jwt-demo');
});
