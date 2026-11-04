import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { buildMultipartHeaders, findResult, getUploadDestination, uploadFile } from '../src/providers.mjs';
import { UploadQueue } from '../src/queue.mjs';

const config={streamtapeLogin:'fake',streamtapeKey:'fake',doodKey:'fake',streamwishKey:'fake',filemoonToken:'fake'};

test('four services can generate separate queue jobs without replacing prior jobs', async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mh-4host-'));
 try{
  await fs.writeFile(path.join(dir,'authorized.mp4'),Buffer.alloc(1024));
  const q=await new UploadQueue(config,path.join(dir,'queue.json')).init();
  assert.equal((await q.add(dir,['streamtape','doodstream','filemoon','streamwish'])).added,4);
  assert.equal((await q.add(dir,['filemoon','streamwish'])).added,0);
  assert.deepEqual(new Set(q.publicState().jobs.map(x=>x.provider)),new Set(['streamtape','doodstream','filemoon','streamwish']));
  assert.equal(q.publicState().providers.streamwish,true);
  await q.close();
 }finally{await fs.rm(dir,{force:true,recursive:true});}
});

test('StreamWish upload form includes key as field and file field',()=>{
 const h=buildMultipartHeaders('clip.mkv',100,'streamwish',config);
 const p=h.prefix.toString();
 assert.match(p,/name="key"/);assert.match(p,/name="file"; filename="clip.mkv"/);
 assert.equal(h.totalLength,h.prefix.length+100+h.suffix.length);
 assert.deepEqual(findResult('streamwish',{status:200,files:[{filecode:'abc123',status:'OK'}]}),{id:'abc123',url:'',alternateUrls:[]});
});

test('StreamWish obtains its upload destination via API without exposing key in result',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  assert.match(String(url),/api\.streamwish\.com\/api\/upload\/server\?key=fake/);
  return new Response(JSON.stringify({status:200,result:'https://upload.example/upload/01'}),{status:200});
 };
 try{assert.equal(await getUploadDestination('streamwish',config),'https://upload.example/upload/01');}
 finally{globalThis.fetch=original;}
});

test('FileMoon token is sent as Bearer, chunks preserve source filename and progressive offsets',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mh-filemoon-'));
 const filePath=path.join(dir,'myclip.mp4');await fs.writeFile(filePath,Buffer.alloc(2300,0x35));
 const chunks=[], progresses=[];
 const server=createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer fake');
  const buffers=[];for await(const buf of req)buffers.push(buf);
  const body=Buffer.concat(buffers).toString('latin1');
  chunks.push(body);
  const isLast=chunks.length===3;
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify(isLast
   ? {success:true,data:{id:'filemoonABC',urls:{page:'https://filemoon.org/filemoonABC/file'}}}
   : {success:true,message:'chunk received'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const out=await uploadFile({filePath,size:2300,provider:'filemoon',config,
   url:`http://127.0.0.1:${server.address().port}/upload`,signal:new AbortController().signal,
   onProgress:p=>progresses.push(p),filemoonChunkBytes:1000});
  assert.equal(out.id,'filemoonABC');assert.equal(out.url,'https://filemoon.org/filemoonABC/file');
  assert.equal(chunks.length,3);
  for(let i=0;i<3;i++){
   assert.match(chunks[i],/filename="myclip.mp4"/);
   assert.match(chunks[i],new RegExp(`name="dzchunkindex"\\r\\n\\r\\n${i}\\r\\n`));
   assert.match(chunks[i],new RegExp(`name="dzchunkbyteoffset"\\r\\n\\r\\n${i*1000}\\r\\n`));
   assert.match(chunks[i],/name="dzuuid"/);
  }
  assert.ok(progresses.includes(100));
 }finally{server.close();await fs.rm(dir,{force:true,recursive:true});}
});

test('FileMoon accepted upload with no file ID returns uncertain error, not completed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mh-filemoon-'));
 const filePath=path.join(dir,'test.mp4');await fs.writeFile(filePath,Buffer.alloc(80));
 const server=createServer(async(req,res)=>{for await(const _ of req){};res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({success:true}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await assert.rejects(uploadFile({filePath,size:80,provider:'filemoon',config,
   url:`http://127.0.0.1:${server.address().port}/upload`,signal:new AbortController().signal,onProgress:()=>{}}),
   /no public file ID/);
 }finally{server.close();await fs.rm(dir,{force:true,recursive:true});}
});
