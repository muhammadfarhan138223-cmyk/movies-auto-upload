import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanFolder, UploadQueue } from '../src/queue.mjs';
import { buildMultipartHeaders, findResult } from '../src/providers.mjs';

test('multipart Streamtape expects file1, Dood expects file', () => {
 const a = buildMultipartHeaders('movie.mp4',120,'streamtape',{doodKey:''});
 const b = buildMultipartHeaders('movie.mp4',120,'doodstream',{doodKey:'FAKE_KEY'});
 assert.match(a.prefix.toString(),/name="file1"/);
 assert.match(b.prefix.toString(),/name="file"/);
 assert.match(b.prefix.toString(),/name="api_key"/);
 assert.equal(a.totalLength,a.prefix.length+120+a.suffix.length);
});
test('parse documented Dood response and Streamtape id',()=>{
 assert.equal(findResult('doodstream',{status:200,result:[{filecode:'abc123',protected_embed:'https://dood.to/e/abc123'}]}).id,'abc123');
 assert.equal(findResult('streamtape',{status:200,result:{files:[{linkid:'def456'}]}}).url,'https://streamtape.com/v/def456');
});
test('folder scan and queue persist; duplicate avoidance',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moviehub-'));
 try {
   await fs.writeFile(path.join(dir,'demo.mp4'),Buffer.from('test'));
   await fs.writeFile(path.join(dir,'ignore.txt'),'skip');
   const files=await scanFolder(dir);assert.equal(files.length,1);
   const q = new UploadQueue({streamtapeLogin:'test',streamtapeKey:'test',doodKey:''},path.join(dir,'queue.json'));
   await q.init();
   assert.equal((await q.add(dir,['streamtape'])).added,1);
   assert.equal((await q.add(dir,['streamtape'])).added,0);
   assert.equal(q.publicState().jobs.length,1);
   await q.close();
 } finally {await fs.rm(dir,{recursive:true,force:true})}
});

test('stream a real multipart upload to a local mock host',async()=>{
  const {createServer} = await import('node:http');
  const {uploadFile} = await import('../src/providers.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'moviehub-http-'));
  const filePath=path.join(dir,'test.mp4');
  await fs.writeFile(filePath, Buffer.alloc(512*1024,8));
  let received=0;
  const server=createServer(async(req,res)=>{
    const buffers=[];
    for await(const chunk of req){received+=chunk.length;buffers.push(chunk);}
    assert.match(Buffer.concat(buffers).subarray(0,450).toString(),/name="file1"/);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({status:200,result:{files:[{linkid:'ExampleId001'}]}}));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  try {
    const size=(await fs.stat(filePath)).size;
    const out=await uploadFile({filePath,size,provider:'streamtape',config:{},
      url:`http://127.0.0.1:${server.address().port}/upload`,
      signal:new AbortController().signal,onProgress:()=>{}});
    assert.equal(out.id,'ExampleId001');
    assert.ok(received > size);
  } finally {server.close();await fs.rm(dir,{recursive:true,force:true});}
});
