import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { UploadQueue } from '../src/queue.mjs';
import { ShutdownManager } from '../src/shutdown.mjs';

async function fixture() {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moviehub-control-'));
 const folderA=path.join(dir,'A');
 const folderB=path.join(dir,'B');
 await fs.mkdir(folderA);await fs.mkdir(folderB);
 for(const f of ['one.mp4','two.mp4','three.mp4'])await fs.writeFile(path.join(folderA,f),'demo');
 await fs.writeFile(path.join(folderB,'four.mp4'),'demo');
 const shutdownCalls=[];
 const sm=new ShutdownManager({platform:'win32',runner:async(cmd,args)=>shutdownCalls.push(args[0])});
 const dataFile=path.join(dir,'data','queue.json');
 const q=await new UploadQueue({streamtapeLogin:'fake',streamtapeKey:'fake'},dataFile,()=>{}, {
  shutdownManager:sm,sync:{enabled:false,lastError:'',lastSuccess:'',push:async()=>true}
 }).init();
 return {dir,folderA,folderB,q,dataFile,shutdownCalls};
}

async function cleanup(t,ctx) { await ctx.q.close();await fs.rm(ctx.dir,{recursive:true,force:true}); }

test('prioritize changes future upload order; hold/resume preserve state across restart',async(t)=>{
 const ctx=await fixture();t.after(()=>cleanup(t,ctx));
 await ctx.q.add(ctx.folderA,['streamtape']);
 const [one,two,three]=ctx.q.jobs;
 await ctx.q.prioritizeJob(three.id);
 assert.equal(ctx.q.jobs.find(j=>j.status==='pending').id,three.id);
 await ctx.q.holdJob(three.id);
 assert.equal(ctx.q.jobs.find(j=>j.id===three.id).status,'held');
 await ctx.q.resumeJob(three.id);
 assert.equal(ctx.q.jobs.find(j=>j.id===three.id).status,'pending');
 await ctx.q.holdJob(two.id);
 const next=await new UploadQueue({streamtapeLogin:'fake',streamtapeKey:'fake'},ctx.dataFile,()=>{}, {
  shutdownManager:ctx.q.shutdown,sync:{enabled:false,lastError:'',lastSuccess:'',push:async()=>true}
 }).init();
 try{assert.equal(next.jobs.find(j=>j.id===two.id).status,'held');assert.equal(next.jobs[0].id,three.id);}finally{await next.close();}
 await ctx.q.removeJob(two.id);
 assert.equal(ctx.q.jobs.some(j=>j.id===two.id),false);
 assert.equal((await fs.stat(path.join(ctx.folderA,'two.mp4'))).isFile(),true,'original file not deleted');
});

test('folder removal recursively removes only pending/held; completed, uploading, other folder preserved',async(t)=>{
 const ctx=await fixture();t.after(()=>cleanup(t,ctx));
 await ctx.q.add(ctx.folderA,['streamtape']);await ctx.q.add(ctx.folderB,['streamtape']);
 const first=ctx.q.jobs[0],second=ctx.q.jobs[1];
 first.status='uploading';second.status='completed';
 const preview=ctx.q.previewFolderRemoval(ctx.folderA);
 assert.equal(preview.count,1);
 assert.equal((await ctx.q.removeFolderJobs(ctx.folderA,preview.ids)).removed,1);
 assert.equal(ctx.q.jobs.length,3);
 assert.equal(ctx.q.jobs.find(j=>j.id===first.id).status,'uploading');
 assert.equal(ctx.q.jobs.find(j=>j.id===second.id).status,'completed');
 assert.ok(ctx.q.jobs.some(j=>j.filePath.startsWith(ctx.folderB)));
 assert.equal((await fs.readdir(ctx.folderA)).length,3);
});

test('cannot remove in-progress, completed or nonexistent jobs; reject mismatched folder IDs',async(t)=>{
 const ctx=await fixture();t.after(()=>cleanup(t,ctx));
 await ctx.q.add(ctx.folderA,['streamtape']);await ctx.q.add(ctx.folderB,['streamtape']);
 const uploading=ctx.q.jobs[0],other=ctx.q.jobs.at(-1);
 uploading.status='uploading';
 await assert.rejects(ctx.q.removeJob(uploading.id),/Only pending or held jobs/);
 await assert.rejects(ctx.q.holdJob(uploading.id),/Only pending or held jobs/);
 await assert.rejects(ctx.q.removeFolderJobs(ctx.folderA,[other.id]),/Preview folder removal again/);
 await assert.rejects(ctx.q.prioritizeJob('fake-id'),/not found/);
});

test('manual queue removal during active run prevents unexpected auto shutdown',async(t)=>{
 const ctx=await fixture();t.after(()=>cleanup(t,ctx));
 await ctx.q.add(ctx.folderA,['streamtape']);await ctx.q.setSettings({autoShutdown:true,shutdownDelaySeconds:120});
 let processStarted=()=>{};
 const started=new Promise(r=>{processStarted=r});
 let finishCurrent=()=>{};
 const finish=new Promise(r=>{finishCurrent=r});
 ctx.q.process=async job=>{processStarted();await finish;job.status='completed';job.progress=100;};
 await ctx.q.start();await started;
 // The mock upload has begun but deliberately does not change its own status.
 ctx.q.jobs[0].status='uploading';
 const preview=ctx.q.previewFolderRemoval(ctx.folderA);
 assert.equal(preview.count,2);
 await ctx.q.removeFolderJobs(ctx.folderA,preview.ids);
 finishCurrent();
 for(let i=0;i<100&&ctx.q.busy;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(ctx.q.jobs.length,1);
 assert.equal(ctx.q.jobs[0].status,'completed');
 assert.deepEqual(ctx.shutdownCalls,[], 'editing queue while running must suppress automatic shutdown');
});

test('held job is not uploaded until resumed and queue start re-issued',async(t)=>{
 const ctx=await fixture();t.after(()=>cleanup(t,ctx));
 await ctx.q.add(ctx.folderA,['streamtape']);
 let count=0;const heldId=ctx.q.jobs[0].id;await ctx.q.holdJob(heldId);
 ctx.q.process=async j=>{count++;j.status='completed';j.progress=100;};
 await ctx.q.start();
 for(let i=0;i<100&&ctx.q.busy;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(count,2);assert.equal(ctx.q.jobs.find(j=>j.id===heldId).status,'held');
 await ctx.q.resumeJob(heldId);await ctx.q.start();
 for(let i=0;i<100&&ctx.q.busy;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(count,3);
});
