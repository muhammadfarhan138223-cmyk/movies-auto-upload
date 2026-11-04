/* No dependencies. Owner login is Supabase Auth; PostgreSQL RLS restricts status rows. */
const el=id=>document.getElementById(id);
const cfg=window.MH_CONFIG||{};
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.supabaseUrl||'')
 && !!cfg.publishableKey && cfg.publishableKey!=='YOUR_SUPABASE_PUBLISHABLE_KEY';
const key='mh-monitor-session-v2';let session=null;let polling=false;
function message(text){el('message').textContent=text;}
function display(id,on){el(id).hidden=!on;}
function headers(jwt){return {'apikey':cfg.publishableKey, ...(jwt?{Authorization:`Bearer ${jwt}`}:{})};}
function saveSession(s){session=s;try{localStorage.setItem(key,JSON.stringify(s));}catch{message('Browser storage unavailable: re-login may be needed.');}}
function clearSession(){session=null;localStorage.removeItem(key);display('login',true);display('dashboard',false);}
function parseUrlAuth(){
 const frag=new URLSearchParams(location.hash.slice(1));
 const access_token=frag.get('access_token'),refresh_token=frag.get('refresh_token');
 if(access_token&&refresh_token){saveSession({access_token,refresh_token,expiresAt:Date.now()+Math.max(60,Number(frag.get('expires_in'))||3600)*1000});
  history.replaceState({},'',location.pathname);message('Signed in successfully.');return true;}
 return false;
}
async function requestToken(grant,body){
 const res=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=${grant}`,{
  method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!res.ok)throw new Error(`Authentication HTTP ${res.status}. Check user confirmation and Auth settings.`);
 const data=await res.json();if(!data.access_token||!data.refresh_token)throw new Error('Login did not return tokens');
 saveSession({access_token:data.access_token,refresh_token:data.refresh_token,
  expiresAt:Date.now()+(Number(data.expires_in)||3600)*1000});
}
async function freshToken(){
 if(!session)return null;
 if(Date.now()<session.expiresAt-90000)return session.access_token;
 try{await requestToken('refresh_token',{refresh_token:session.refresh_token});return session.access_token;}
 catch(e){clearSession();throw new Error('Session expired. Please log in again.');}
}
async function refresh(){
 if(!configured||!session||polling||document.hidden)return;
 polling=true;
 try{
  const token=await freshToken();
  const url=`${cfg.supabaseUrl}/rest/v1/mh_uploader_snapshot?select=payload,updated_at&id=eq.1`;
  const res=await fetch(url,{headers:headers(token),cache:'no-store'});
  if(res.status===401){session.expiresAt=0;await freshToken();return;}
  if(!res.ok)throw new Error(`Status request HTTP ${res.status} (check RLS and Auth user)`);
  const data=await res.json();if(!data.length)throw new Error('No status access. This login is not the configured owner, or the snapshot row is missing.');
  render(data[0]);display('login',false);display('dashboard',true);message('');
 }catch(e){message(e.message);el('network').textContent='Sync issue';}finally{polling=false;}
}
function text(parent,tag,content,classname){const e=document.createElement(tag);e.textContent=String(content??'');if(classname)e.className=classname;parent.append(e);return e;}
function safeUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:null;}catch{return null}}
function render(entry){
 const snapshot=entry.payload||{};const jobs=Array.isArray(snapshot.jobs)?snapshot.jobs:[];
 el('total').textContent=jobs.length;el('done').textContent=jobs.filter(j=>j.status==='completed').length;
 el('pending').textContent=jobs.filter(j=>['pending','uploading'].includes(j.status)).length;
 el('failed').textContent=jobs.filter(j=>['review','failed'].includes(j.status)).length;
 const stamp=new Date(entry.updated_at||0).getTime(),age=Date.now()-stamp;
 el('network').textContent=age>120000?'Laptop offline / stale':'● Synced';
 el('running').textContent=age>120000?'Offline / stale':snapshot.busy?'Uploading':snapshot.running?'Running':'Idle';
 el('lastUpdate').textContent=stamp?`Synced: ${new Date(stamp).toLocaleString()}`:'No sync yet';
 const shut=snapshot.shutdown?.scheduledAt;
 el('shutdown').textContent=shut?`Windows shutdown scheduled for ${new Date(shut).toLocaleString()}. Cancel it on laptop if necessary.`:'No Windows shutdown scheduled.';
 const container=el('jobs');container.replaceChildren();
 if(!jobs.length){text(container,'p','No uploaded status records.','hint');return;}
 for(const job of [...jobs].reverse()){
  const card=document.createElement('article');card.className='job';
  const top=document.createElement('div');top.className='top';
  text(top,'strong',job.name||'Untitled');text(top,'small',job.status||'unknown');card.append(top);
  text(card,'small',`${job.provider||'unknown'} · ${(Number(job.size||0)/1048576).toFixed(1)} MiB · ${Number(job.progress)||0}%`);
  const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('div');fill.className='fill';
  fill.style.width=`${Math.max(0,Math.min(100,Number(job.progress)||0))}%`;bar.append(fill);card.append(bar);
  const link=safeUrl(job.url);if(link){const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open result ↗';card.append(a);}
  if(job.error)text(card,'small',job.error);container.append(card);
 }
}
async function sendLink(event){event.preventDefault();if(!configured)return;
 const email=el('email').value.trim();
 try{
  const url=new URL(`${cfg.supabaseUrl}/auth/v1/otp`);
  url.searchParams.set('redirect_to',location.origin+location.pathname);
  const resp=await fetch(url,{method:'POST',headers:{...headers(),'Content-Type':'application/json'},
   body:JSON.stringify({email,create_user:false})});
  if(!resp.ok)throw new Error(`Could not send link (HTTP ${resp.status})`);
  message('If this account is allowed, a sign-in email has been sent. Check inbox and spam.');
 }catch(e){message(e.message);}
}
async function logout(){
 if(session){try{await fetch(`${cfg.supabaseUrl}/auth/v1/logout`,{method:'POST',headers:headers(session.access_token)});}catch{}}
 clearSession();message('Signed out.');
}
async function init(){
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
 if(!configured){display('setup',true);message('Public config.js is missing or incomplete.');return;}
 parseUrlAuth();
 if(!session){try{session=JSON.parse(localStorage.getItem(key)||'null');}catch{session=null;}}
 display('login',!session);display('dashboard',Boolean(session));
 if(session)await refresh();
}
el('loginForm').addEventListener('submit',sendLink);
el('logout').addEventListener('click',logout);el('refresh').addEventListener('click',refresh);
window.addEventListener('online',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
init();setInterval(refresh,20000);
