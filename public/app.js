const $=s=>document.querySelector(s);
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(endpoint,method='GET',body){
 const r=await fetch('/api/'+endpoint,{method,headers:{'Content-Type':'application/json','X-MovieHub-Local':'1'},body:body?JSON.stringify(body):undefined});
 const text=await r.text();let j;try{j=JSON.parse(text)}catch{throw new Error(`Server returned ${r.status}`)}
 if(!r.ok)throw new Error(j.error||'Request failed');return j;
}
function notice(msg,good=false){$('#notice').textContent=msg;$('#notice').style.color=good?'#66daa3':'#ffaf83';}
let syncReadyBefore=false;let firstSettings=true;
async function refresh(){
 try{
  const s=await api('state');
  $('#connection').textContent='Local uploader connected';
  $('#runState').textContent=s.busy?(s.pauseRequested?'Finishing current upload':'● Queue running'):(s.running?'Starting':'Paused / Idle');
  $('#total').textContent=s.jobs.length;$('#completed').textContent=s.jobs.filter(j=>j.status==='completed').length;
  $('#pending').textContent=s.jobs.filter(j=>['pending','held','uploading'].includes(j.status)).length;
  $('#errors').textContent=s.jobs.filter(j=>['failed','review'].includes(j.status)).length;
  for(const [id,key] of [['stream','streamtape'],['dood','doodstream'],['filemoon','filemoon'],['streamwish','streamwish']]){
   $('#'+id+'State').textContent=s.providers[key]?'✓ Ready':'✕ Configure in .env';
   $('#'+id).disabled=!s.providers[key];if(!s.providers[key])$('#'+id).checked=false;
  }
  if(firstSettings){$('#autoShutdown').checked=s.settings.autoShutdown;$('#shutdownDelay').value=s.settings.shutdownDelaySeconds;firstSettings=false;}
  $('#saveShutdown').disabled=!s.shutdown.supported;
  $('#shutdownStatus').textContent=s.shutdown.scheduledAt?`Shutdown scheduled: ${new Date(s.shutdown.scheduledAt).toLocaleTimeString()}`
   :s.settings.autoShutdown?'Auto shutdown enabled':'Auto shutdown disabled';
  $('#cancelShutdown').hidden=!s.shutdown.scheduledAt;
  $('#syncStatus').textContent=s.syncReady?(s.syncLastSuccess?'Remote synced':'Remote configured, not yet synced'):'Remote PWA not configured';
  $('#syncError').textContent=s.syncError?'Last sync error: '+s.syncError:(s.syncLastSuccess?`Last sync: ${new Date(s.syncLastSuccess).toLocaleString()}`:'');
  $('#rows').innerHTML=s.jobs.map(j=>{
   const alternatives=(j.alternateUrls||[]).filter(u=>typeof u==='string'&&u.startsWith('https://'));
   const result=j.url?.startsWith('https://')?`<small><a href="${escapeText(j.url)}" target="_blank" rel="noopener noreferrer">Open result ↗</a></small>`:'';
   const more=alternatives.length?`<small>${alternatives.map((u,i)=>`<a href="${escapeText(u)}" target="_blank" rel="noopener noreferrer">Alternative ${i+1} ↗</a>`).join(' · ')}</small>`:'';
   return `<tr><td><b>${escapeText(j.name)}</b><small>${(j.size/1048576).toFixed(1)} MiB${j.remoteId?' · ID: '+escapeText(j.remoteId):''}</small></td><td>${escapeText(j.provider)}</td>
   <td><div class="track"><div class="fill" style="width:${Math.min(100,Math.max(0,Number(j.progress)||0))}%"></div></div><small>${j.progress||0}%</small></td>
   <td><span class="tag">${escapeText(j.status)}</span>${result}${more}${j.error?`<small>${escapeText(j.error)}</small>`:''}</td>
   <td class="job-actions">${j.status==='pending'?`<button data-prioritize="${escapeText(j.id)}" title="Upload after current job">⬆ Move to top</button><button data-hold="${escapeText(j.id)}">⏸ Hold</button><button data-remove="${escapeText(j.id)}" class="remove">✕ Remove</button>`:j.status==='held'?`<button data-resume="${escapeText(j.id)}">▶ Resume job</button><button data-remove="${escapeText(j.id)}" class="remove">✕ Remove</button>`:j.provider==='filemoon' && j.status==='review'?`<button data-confirm-filemoon="${escapeText(j.id)}">✓ Verify saved file</button><button data-retry="${escapeText(j.id)}">Verify & retry</button>`:['failed','review'].includes(j.status)?`<button data-retry="${escapeText(j.id)}">Verify & retry</button>`:j.status==='completed'?`<button data-link="${escapeText(j.id)}">Set working link</button>`:'—'}</td></tr>`;
  }).join('')||'<tr><td colspan="5">No jobs yet. Add a folder above.</td></tr>';
 }catch(e){$('#connection').textContent='Local server disconnected';notice(e.message);}
}
$('#form').addEventListener('submit',async e=>{e.preventDefault();try{
 const providers=[...document.querySelectorAll('.hosts input:checked')].map(x=>x.value);
 const r=await api('add','POST',{folder:$('#folder').value.trim(),providers});
 notice(`Found ${r.found} files; ${r.added} new upload jobs added.`,true);await refresh();
}catch(e){notice(e.message);}});
$('#start').addEventListener('click',async()=>{try{await api('start','POST',{});notice('Queue started. Keep laptop awake and terminal open.',true);await refresh();}catch(e){notice(e.message)}});
$('#pause').addEventListener('click',async()=>{try{await api('pause','POST',{});notice('Current upload will finish; NEXT upload will not start. Laptop will NOT shut down.',true);await refresh();}catch(e){notice(e.message)}});
$('#removeFolder').addEventListener('click',async()=>{
 const folder=$('#folder').value.trim();
 if(!folder){notice('Enter the folder you want to remove from the queue.');return;}
 try{
  const preview=await api('preview-remove-folder','POST',{folder});
  if(!preview.count){notice('No pending or held jobs found inside that folder.');return;}
  if(!confirm(`Remove ${preview.count} pending/held upload jobs from ${folder}?\n\nAlready uploading or completed jobs will stay. Original video files will NOT be deleted.`))return;
  const result=await api('remove-folder','POST',{folder,ids:preview.ids});
  notice(`Removed ${result.removed} queued upload jobs. Original files are untouched.`,true);await refresh();
 }catch(e){notice(e.message);}
});
$('#clear').addEventListener('click',async()=>{if(!confirm('Remove completed records from local history? Hosted videos are NOT deleted. Export CSV first.'))return;try{await api('clear','POST',{});await refresh();}catch(e){notice(e.message)}});
$('#saveShutdown').addEventListener('click',async()=>{
 const autoShutdown=$('#autoShutdown').checked;
 if(autoShutdown&&!confirm('Enable automatic WINDOWS SHUTDOWN at the end of a fully successful future batch? Unsaved work in other apps can be lost.'))return;
 try{await api('settings','POST',{autoShutdown,shutdownDelaySeconds:Number($('#shutdownDelay').value)});notice('Shutdown preferences saved.',true);await refresh();}catch(e){notice(e.message)}
});
$('#cancelShutdown').addEventListener('click',async()=>{try{await api('cancel-shutdown','POST',{});$('#autoShutdown').checked=false;notice('Windows shutdown cancelled and auto shutdown disabled.',true);await refresh();}catch(e){notice(e.message)}});
$('#syncNow').addEventListener('click',async()=>{try{const r=await api('sync','POST',{});notice(r.ok?'Remote status sync successful.':'Sync not ready: '+(r.error||'Configure first'),r.ok);await refresh();}catch(e){notice(e.message)}});
$('#rows').addEventListener('click',async e=>{
 const prioritize=e.target.closest('[data-prioritize]')?.dataset.prioritize;
 const hold=e.target.closest('[data-hold]')?.dataset.hold;
 const resume=e.target.closest('[data-resume]')?.dataset.resume;
 const remove=e.target.closest('[data-remove]')?.dataset.remove;
 if(prioritize){try{await api('prioritize-job','POST',{id:prioritize});notice('Job moved to the top of pending uploads. Current upload will finish first.',true);await refresh();}catch(err){notice(err.message)}return;}
 if(hold){try{await api('hold-job','POST',{id:hold});notice('Pending job held. It will not upload until you resume it.',true);await refresh();}catch(err){notice(err.message)}return;}
 if(resume){try{await api('resume-job','POST',{id:resume});notice('Job resumed and pending. Press Start uploading if queue is idle.',true);await refresh();}catch(err){notice(err.message)}return;}
 if(remove){if(!confirm('Remove this pending/held upload JOB from the queue?\nOriginal video on disk will NOT be deleted.'))return;
  try{await api('remove-job','POST',{id:remove});notice('Job removed from queue. File on disk is unchanged.',true);await refresh();}catch(err){notice(err.message)}return;}
 const confirmFilemoon=e.target.closest('[data-confirm-filemoon]')?.dataset.confirmFilemoon;
 if(confirmFilemoon){
  const url=prompt('FileMoon My Files → Share: paste the official https://filemoon.org/FILE_ID/file URL. The app checks the file ID, name and size using your local FileMoon token (needs files:read). It will NOT upload again.');
  if(url===null)return;
  try{await api('confirm-filemoon','POST',{id:confirmFilemoon,url:url.trim()});notice('Saved FileMoon file verified. Upload marked completed; video processing may still be running.',true);await refresh();}
  catch(err){notice('Verification failed: '+err.message);}
  return;
 }
 const retry=e.target.closest('[data-retry]')?.dataset.retry;
 const link=e.target.closest('[data-link]')?.dataset.link;
 if(retry){if(!confirm('VERIFY the file in your provider account first. Retrying may create duplicates. Retry?'))return;
  try{await api('retry','POST',{id:retry});notice('Job queued for retry. Press Start uploading.',true);await refresh();}catch(e){notice(e.message)}}
 if(link){const url=prompt('Paste a WORKING HTTPS link copied from your provider account. It replaces Open result; the old URL is saved as an alternative.');
  if(url===null)return;try{await api('link','POST',{id:link,url:url.trim()});notice('Result link updated locally.',true);await refresh();}catch(e){notice(e.message)}}
});
refresh();setInterval(refresh,2500);
