import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configured, getUploadDestination, uploadFile } from './providers.mjs';
import { StatusSync } from './sync.mjs';
import { ShutdownManager } from './shutdown.mjs';
const videoExtensions = new Set(['.mp4','.mkv','.mov','.webm','.avi','.m4v']);
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const now = () => new Date().toISOString();
export const cleanJob = j=>({id:j.id,name:j.name,provider:j.provider,size:j.size,status:j.status,
 progress:j.progress,attempts:j.attempts,url:j.url||'',alternateUrls:j.alternateUrls||[],remoteId:j.remoteId||'',
 error:j.error||'',createdAt:j.createdAt,updatedAt:j.updatedAt});
export async function scanFolder(folder) {
 if(typeof folder!=='string'||!folder.trim())throw new Error('Select a folder path first');
 const full=path.resolve(folder.trim().replace(/^"|"$/g,''));
 if(!(await fs.stat(full).catch(()=>null))?.isDirectory())throw new Error('Folder not found. Example: E:\\Movies');
 const out=[];
 async function walk(dir,depth=0){
  if(depth>4)return;
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const fp=path.join(dir,entry.name);
   if(entry.isDirectory()) {await walk(fp,depth+1);continue;}
   if(!entry.isFile()||!videoExtensions.has(path.extname(fp).toLowerCase()))continue;
   const st=await fs.stat(fp);if(st.size)out.push({filePath:fp,name:entry.name,size:st.size,modifiedAt:st.mtimeMs});
   if(out.length>1000)throw new Error('Over 1000 videos found; split into batches');
  }
 }
 await walk(full);return out.sort((a,b)=>a.name.localeCompare(b.name));
}
export class UploadQueue {
 constructor(config,dataFile,onChange=()=>{},{shutdownManager=null,sync=null}={}){
  this.config=config;this.dataFile=dataFile;this.settingsFile=path.join(path.dirname(dataFile),'settings.json');this.onChange=onChange;
  this.jobs=[];this.running=false;this.busy=false;this.pauseRequested=false;this.controller=null;
  this.settings={autoShutdown:false,shutdownDelaySeconds:120};
  this.shutdown=shutdownManager||new ShutdownManager();this.sync=sync||new StatusSync(config);
  this.persistChain=Promise.resolve();this.lastSavedAt=0;this.interval=null;this.runCompleted=0;this.queueEditedDuringRun=false;
 }
 async init(){
  await fs.mkdir(path.dirname(this.dataFile),{recursive:true});
  const saved=JSON.parse(await fs.readFile(this.dataFile,'utf8').catch(e=>{if(e.code==='ENOENT')return '{"jobs":[]}';throw e;}));
  this.jobs=(saved.jobs||[]).map(j=>({...j,status:j.status==='uploading'?'review':j.status,
   error:j.status==='uploading'?'App restarted mid-transfer. Check host account before retry.':j.error,
   progress:j.status==='uploading'?0:j.progress,alternateUrls:j.alternateUrls||[]}));
  try{const s=JSON.parse(await fs.readFile(this.settingsFile,'utf8'));
   this.settings={autoShutdown:Boolean(s.autoShutdown)&&this.shutdown.supported,
    shutdownDelaySeconds:Number.isInteger(s.shutdownDelaySeconds)&&s.shutdownDelaySeconds>=60&&s.shutdownDelaySeconds<=600?s.shutdownDelaySeconds:120};
  }catch(e){if(e.code!=='ENOENT')console.warn('Settings could not be read; using safe defaults:',e.message);}
  this.interval=setInterval(()=>this.syncStatus().catch(()=>{}),20000);this.interval.unref?.();return this;
 }
 publicState(){return {version:'2.2.0',running:this.running,busy:this.busy,
  pauseRequested:this.pauseRequested,settings:this.settings,shutdown:this.shutdown.state,
  syncReady:this.sync.enabled,syncLastSuccess:this.sync.lastSuccess,syncError:this.sync.lastError,
  providers:{streamtape:configured(this.config,'streamtape'),doodstream:configured(this.config,'doodstream'),filemoon:configured(this.config,'filemoon'),streamwish:configured(this.config,'streamwish')},
  jobs:this.jobs.map(cleanJob)};}
 remoteState(){let s=this.publicState();delete s.syncError;delete s.settings;
  return {...s,updatedAt:now(),jobs:s.jobs.slice(-500).map(j=>({...j,error:j.error.slice(0,300)}))};}
 async save(){
  this.persistChain=this.persistChain.catch(e=>console.error('Previous save failed:',e.message)).then(async()=>{
   const text=JSON.stringify({version:2,jobs:this.jobs},null,2);
   const temp=this.dataFile+'.tmp';await fs.writeFile(temp,text,{mode:0o600});await fs.rename(temp,this.dataFile);
  });await this.persistChain;this.lastSavedAt=Date.now();this.onChange();
 }
 async saveSettings(){await fs.writeFile(this.settingsFile,JSON.stringify(this.settings,null,2),{mode:0o600});this.onChange();}
 async setSettings({autoShutdown,shutdownDelaySeconds}){
  if(typeof autoShutdown!=='boolean')throw new Error('autoShutdown must be true or false');
  const delay=Number(shutdownDelaySeconds);
  if(!Number.isInteger(delay)||delay<60||delay>600)throw new Error('Delay must be 60-600 seconds');
  if(autoShutdown&&!this.shutdown.supported)throw new Error('Auto shutdown is only supported on Windows');
  if(!autoShutdown && this.shutdown.state.scheduledAt)await this.shutdown.cancel();
  this.settings={autoShutdown,shutdownDelaySeconds:delay};await this.saveSettings();
  return this.settings;
 }
 async cancelShutdown(){await this.shutdown.cancel();this.settings.autoShutdown=false;await this.saveSettings();await this.syncStatus();}
 async add(folder,providers){
  if(!Array.isArray(providers)||!providers.length||providers.some(x=>!['streamtape','doodstream','filemoon','streamwish'].includes(x)))throw new Error('Select valid providers');
  for(const p of providers)if(!configured(this.config,p))throw new Error(`${p} API credentials missing in .env`);
  const files=await scanFolder(folder);if(!files.length)throw new Error('No supported video files in folder');
  const known=new Set(this.jobs.map(j=>[j.filePath,j.size,j.modifiedAt,j.provider].join('|')));
  let added=0;
  for(const f of files)for(const provider of providers){
   const key=[f.filePath,f.size,f.modifiedAt,provider].join('|');if(known.has(key))continue;
   if(this.shutdown.state.scheduledAt)await this.cancelShutdown();
   this.jobs.push({id:randomUUID(),...f,provider,status:'pending',progress:0,attempts:0,url:'',alternateUrls:[],error:'',createdAt:now(),updatedAt:now()});
   known.add(key);added++;
  }
  if(added)await this.save();return {found:files.length,added,jobs:this.jobs.length};
 }
 async start(){
  if(this.busy)return {alreadyRunning:true};
  if(this.shutdown.state.scheduledAt)throw new Error('Cancel scheduled shutdown before starting another batch');
  if(!this.jobs.some(j=>j.status==='pending'))throw new Error('No pending jobs. Add files or verify/retry a failed job.');
  this.running=true;this.pauseRequested=false;this.runCompleted=0;this.queueEditedDuringRun=false;this.onChange();
  void this.loop().catch(e=>console.error('Queue loop:',e.message));return {started:true};
 }
 async pause(){
  this.running=false;this.pauseRequested=true;
  if(this.shutdown.state.scheduledAt)await this.cancelShutdown();
  this.onChange();await this.save();
 }
 // The currently uploading job is never changed or deleted by these controls.
 // Job IDs are generated locally (UUID), not paths supplied by callers.
 getEditableJob(id){
  const job=this.jobs.find(j=>j.id===id);
  if(!job)throw new Error('Upload job not found');
  if(!['pending','held'].includes(job.status))throw new Error('Only pending or held jobs can be changed. Use Pause after current for an active upload.');
  return job;
 }
 markManualEdit(){if(this.busy||this.running)this.queueEditedDuringRun=true;}
 async holdJob(id){
  const job=this.getEditableJob(id);
  if(job.status!=='pending')throw new Error('Only pending jobs can be held');
  this.markManualEdit();job.status='held';job.updatedAt=now();await this.save();return cleanJob(job);
 }
 async resumeJob(id){
  const job=this.getEditableJob(id);
  if(job.status!=='held')throw new Error('Only held jobs can be resumed');
  this.markManualEdit();job.status='pending';job.updatedAt=now();await this.save();return cleanJob(job);
 }
 async prioritizeJob(id){
  const job=this.getEditableJob(id);
  if(job.status!=='pending')throw new Error('Resume held jobs before prioritizing');
  const oldIndex=this.jobs.indexOf(job);
  this.jobs.splice(oldIndex,1);
  const firstPending=this.jobs.findIndex(j=>j.status==='pending');
  this.jobs.splice(firstPending===-1?this.jobs.length:firstPending,0,job);
  this.markManualEdit();job.updatedAt=now();await this.save();return cleanJob(job);
 }
 async removeJob(id){
  const job=this.getEditableJob(id);
  this.markManualEdit();this.jobs=this.jobs.filter(j=>j.id!==id);await this.save();
  return {removed:1,name:job.name,provider:job.provider};
 }
 // A directory scan adds files recursively; a removal matches the same subtree.
 // No local files are ever deleted, only queue records for pending/held jobs.
 normalizeFolder(folder){
  if(typeof folder!=='string'||!folder.trim())throw new Error('Enter a Windows folder path');
  return path.resolve(folder.trim().replace(/^"|"$/g,''));
 }
 editableInFolder(folder){
  const base=this.normalizeFolder(folder);
  return this.jobs.filter(j=>{
   if(!['pending','held'].includes(j.status))return false;
   const relative=path.relative(base,path.resolve(j.filePath));
   return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
  });
 }
 previewFolderRemoval(folder){
  const matches=this.editableInFolder(folder);
  return {count:matches.length,providers:[...new Set(matches.map(j=>j.provider))],
   totalBytes:matches.reduce((sum,j)=>sum+j.size,0),ids:matches.map(j=>j.id)};
 }
 async removeFolderJobs(folder,ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>2000||ids.some(x=>typeof x!=='string'))throw new Error('Preview folder jobs before removing');
  const candidateIds=new Set(this.editableInFolder(folder).map(j=>j.id));
  const chosen=new Set(ids);
  if([...chosen].some(id=>!candidateIds.has(id)))throw new Error('Queue changed. Preview folder removal again.');
  this.markManualEdit();this.jobs=this.jobs.filter(j=>!chosen.has(j.id));await this.save();return {removed:chosen.size};
 }
 async reviewRetry(id){
  const job=this.jobs.find(j=>j.id===id);
  if(!job||!['failed','review'].includes(job.status))throw new Error('Only failed/review jobs can be retried');
  job.status='pending';job.progress=0;job.error='';job.updatedAt=now();await this.save();
 }
 async clearCompleted(){if(this.busy||this.running)throw new Error('Pause and finish current upload before clearing');
  this.jobs=this.jobs.filter(j=>j.status!=='completed');await this.save();}
 async updateLink(id,newUrl){
  const job=this.jobs.find(j=>j.id===id);if(!job||job.status!=='completed')throw new Error('Select a completed job');
  if(typeof newUrl!=='string'||newUrl.length>2000)throw new Error('Invalid URL');
  const parsed=new URL(newUrl);if(parsed.protocol!=='https:'||!parsed.hostname.includes('.'))throw new Error('Enter a valid HTTPS URL');
  job.alternateUrls=[...new Set([job.url,...job.alternateUrls].filter(Boolean))].slice(0,10);job.url=newUrl;
  job.updatedAt=now();await this.save();await this.syncStatus();return cleanJob(job);
 }
 async loop(){
  if(this.busy)return;this.busy=true;
  try{
   while(this.running){
    const job=this.jobs.find(j=>j.status==='pending');if(!job){this.running=false;break;}
    await this.process(job);if(job.status==='completed')this.runCompleted++;
    await this.save();void this.syncStatus();
   }
  }finally{
   this.controller=null;this.busy=false;
   const wasNatural=!this.pauseRequested;
   this.running=false;this.onChange();await this.save();
   if(wasNatural && !this.queueEditedDuringRun && this.runCompleted>0 && this.settings.autoShutdown && this.jobs.length>0 && this.jobs.every(j=>j.status==='completed')){
    // No failed/review/pending jobs, no in-flight transfer and explicit user-enabled switch.
    try{await this.shutdown.schedule(this.settings.shutdownDelaySeconds);this.onChange();}
    catch(e){console.error('Shutdown not scheduled:',e.message);}
   }
   await this.syncStatus();
  }
 }
 async process(job){
  job.status='uploading';job.progress=0;job.error='';job.attempts++;job.updatedAt=now();await this.save();
  const st=await fs.stat(job.filePath).catch(()=>null);
  if(!st||st.size!==job.size||st.mtimeMs!==job.modifiedAt){job.status='failed';job.error='File missing/changed. Reconnect USB or rescan; do not retry blindly.';return;}
  let destination;
  for(let i=0;i<3;i++){
   try{destination=await getUploadDestination(job.provider,this.config);break;}
   catch(e){if(i===2){job.status='failed';job.error=`Upload destination failed: ${e.message}`;return;}await sleep(1500*(i+1));}
  }
  this.controller=new AbortController();let watchdog;let idleTimeoutHit=false;
  const idleMinutes=job.provider==='filemoon'?30:15;
  const renew=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>{
    idleTimeoutHit=true;
    this.controller?.abort(new Error(`No upload activity for ${idleMinutes} minutes (network or host stalled)`));
  },idleMinutes*60*1000);watchdog.unref?.();};renew();
  try{
   const result=await uploadFile({filePath:job.filePath,size:job.size,provider:job.provider,config:this.config,url:destination,
    signal:this.controller.signal,onProgress:(pct)=>{renew();job.progress=pct;job.updatedAt=now();this.onChange();
      if(Date.now()-this.lastSavedAt>6000)void this.save().catch(e=>console.error('Progress save:',e.message));}});
   job.status='completed';job.progress=100;job.url=result.url||'';job.remoteId=result.id||'';job.alternateUrls=result.alternateUrls||[];
  }catch(e){job.status='review';
    const detail=idleTimeoutHit?`No upload activity for ${idleMinutes} minutes; transfer cancelled by watchdog`:(e.message||'Unknown upload error');
    job.error=`Transfer result unconfirmed: ${detail}. Check provider account BEFORE retrying.`;
  }
  finally{clearTimeout(watchdog);this.controller=null;job.updatedAt=now();}
 }
 async syncStatus(){if(!this.sync.enabled)return false;return this.sync.push(this.remoteState());}
 async close(){this.running=false;this.pauseRequested=true;clearInterval(this.interval);await this.save();}
}
