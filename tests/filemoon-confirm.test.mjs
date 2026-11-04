import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {verifyFileMoonUpload} from '../src/filemoon-verify.mjs';
import {UploadQueue} from '../src/queue.mjs';

const url='https://filemoon.org/ABCDEF123456/file';
const good={success:true,data:{id:'ABCDEF123456',filename:'sample.mp4',size_bytes:999}};
const fakeFetch=(response=good,status=200)=>async(u,opts)=>{
 assert.match(u,/^https:\/\/filemoon\.org\/api\/v1\/files\/ABCDEF123456$/);
 assert.equal(opts.headers.Authorization,'Bearer test-read-token');
 return {ok:status>=200&&status<300,status,json:async()=>response};
};
const args=(opts={})=>({shareUrl:url,token:'test-read-token',expectedName:'sample.mp4',
 expectedSize:999,fetchImpl:fakeFetch(),...opts});
test('saved FileMoon file can be verified without another upload',async()=>{
 const r=await verifyFileMoonUpload(args());
 assert.equal(r.id,'ABCDEF123456');assert.equal(r.url,url);
});
test('verification rejects non-FileMoon, insecure and malformed links',async()=>{
 for(const bad of ['https://evil.com/ABCDEF123456/file','http://filemoon.org/ABCDEF123456/file',
 'https://filemoon.org.evil.com/ABCDEF123456/file','https://filemoon.org/ABCDEF123456/other']){
  await assert.rejects(verifyFileMoonUpload(args({shareUrl:bad})),/FileMoon|official|HTTPS|format/);
 }
});
test('verification requires identical file ID, filename and size',async()=>{
 await assert.rejects(verifyFileMoonUpload(args({fetchImpl:fakeFetch({...good,data:{...good.data,id:'OTHER'}})})),/exact file ID/);
 await assert.rejects(verifyFileMoonUpload(args({expectedSize:1000})),/File size mismatch/);
 await assert.rejects(verifyFileMoonUpload(args({expectedName:'different.mp4'})),/filename differs/);
});
test('403 verification does not mark upload completed',async()=>{
 await assert.rejects(verifyFileMoonUpload(args({fetchImpl:fakeFetch({},403)})),/files:read/);
});
test('reconciliation persists verified result and does not change unrelated queue jobs',async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fm-confirm-'));
 const q=await new UploadQueue({filemoonToken:'test-read-token'},path.join(dir,'data','queue.json'),()=>{},{
  sync:{enabled:false,lastError:'',lastSuccess:'',push:async()=>true},
  shutdownManager:{supported:false,state:{scheduledAt:null}}
 }).init();
 t.after(async()=>{await q.close();await fs.rm(dir,{recursive:true,force:true});});
 const job={id:'job1',provider:'filemoon',status:'review',name:'sample.mp4',size:999,
  progress:99,error:'unconfirmed',filePath:path.join(dir,'sample.mp4'),modifiedAt:0,
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 q.jobs=[job,{...job,id:'job2',provider:'streamtape',status:'pending'}];
 const old=globalThis.fetch;globalThis.fetch=fakeFetch();
 try{
  const done=await q.confirmFileMoonSaved('job1',url);
  assert.equal(done.status,'completed');assert.equal(done.progress,100);
  assert.equal(done.remoteId,'ABCDEF123456');assert.equal(done.url,url);
  assert.equal(q.jobs[1].status,'pending');
  const saved=JSON.parse(await fs.readFile(q.dataFile,'utf8'));
  assert.equal(saved.jobs[0].verifiedBy,'filemoon-api');
  await assert.rejects(q.confirmFileMoonSaved('job1',url),/needs review/);
 }finally{globalThis.fetch=old;}
});
