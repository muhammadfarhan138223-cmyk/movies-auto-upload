import fs from 'node:fs';
import { Readable } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

export function configured(config, provider) {
  if (provider === 'streamtape') return Boolean(config.streamtapeLogin && config.streamtapeKey);
  if (provider === 'doodstream') return Boolean(config.doodKey);
  if (provider === 'filemoon') return Boolean(config.filemoonToken);
  if (provider === 'streamwish') return Boolean(config.streamwishKey);
  return false;
}

function assertSuccess(data, provider) {
  if (!data || Number(data.status) !== 200) {
    const status = data?.status ?? 'unknown';
    throw new Error(`${provider} API returned status ${status}. Check credentials/limits.`);
  }
  return data;
}

async function apiJson(url, provider) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'error' });
  if (!resp.ok) throw new Error(`${provider} API HTTP ${resp.status}`);
  let obj;
  try { obj = await resp.json(); } catch { throw new Error(`${provider} API returned non-JSON`); }
  return assertSuccess(obj, provider);
}

export async function getUploadDestination(provider, config) {
  let u;
  if (provider === 'streamtape') {
    u = new URL('https://api.streamtape.com/file/ul');
    u.searchParams.set('login', config.streamtapeLogin);
    u.searchParams.set('key', config.streamtapeKey);
    const data = await apiJson(u, provider);
    u = new URL(data.result?.url || '');
  } else if (provider === 'doodstream') {
    u = new URL('https://doodapi.co/api/upload/server');
    u.searchParams.set('key', config.doodKey);
    const data = await apiJson(u, provider);
    u = new URL(data.result || '');
    // The DoodStream docs include the API key both as a form field and URL query.
    u.search += (u.search ? '&' : '?') + encodeURIComponent(config.doodKey);
  } else if (provider === 'streamwish') {
    u = new URL('https://api.streamwish.com/api/upload/server');
    u.searchParams.set('key', config.streamwishKey);
    const data = await apiJson(u, provider);
    u = new URL(data.result || '');
  } else if (provider === 'filemoon') {
    u = new URL('https://filemoon.org/api/v1/files/upload');
  } else {
    throw new Error('Invalid provider');
  }
  if (u.protocol !== 'https:') throw new Error('Provider returned insecure upload URL (HTTPS required)');
  return u.toString();
}

const safeFilename = (name) => path.basename(name).replace(/[\r\n"\\]/g, '_');
export function buildMultipartHeaders(filePath, fileSize, provider, config, extraFields = {}) {
  const boundary = '----MovieHub' + randomBytes(20).toString('hex');
  const pre = [];
  if (provider === 'doodstream') {
    pre.push(`--${boundary}\r\nContent-Disposition: form-data; name="api_key"\r\n\r\n${config.doodKey}\r\n`);
  }
  if (provider === 'streamwish') {
    pre.push(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${config.streamwishKey}\r\n`);
  }
  for (const [name, value] of Object.entries(extraFields)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error('Invalid form field');
    pre.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`);
  }
  const field = provider === 'streamtape' ? 'file1' : 'file';
  pre.push(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${safeFilename(filePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const prefix = Buffer.from(pre.join(''), 'utf8');
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return { boundary, prefix, suffix, totalLength: prefix.length + fileSize + suffix.length };
}

/** Parse upload metadata. Never guess changing DoodStream domains. */
export function findResult(provider, obj) {
  const candidates=[];
  const visit=(o,depth=0)=>{
    if (!o || depth>7) return;
    if (Array.isArray(o)) {o.forEach(x=>visit(x,depth+1));return;}
    if (typeof o !== 'object') return;
    const id=o.filecode??o.file_code??o.linkid??o.file_id??o.id;
    const links=[o.download_url,o.protected_dl,o.link,o.embed_url,o.protected_embed,o.url,
      o.urls?.page,o.urls?.watch,o.urls?.embed].filter(v=>typeof v==='string' && /^https:\/\//i.test(v));
    if(id||links.length)candidates.push({id: id!=null?String(id):'',links});
    for (const k of ['result','files','file','data','items']) if(o[k] && o[k]!==o)visit(o[k],depth+1);
  };visit(obj);
  for(const c of candidates){
    const id=c.id||c.links.join(' ').match(/\/(?:v|e|d)\/([A-Za-z0-9]+)/)?.[1];
    if(!id)continue;
    if(provider==='doodstream')return {id,url:c.links[0]||'',alternateUrls:c.links.slice(1)};
    if(provider==='streamtape'){
      const own=c.links.find(u=>/^https:\/\/(?:www\.)?streamtape\.com\/v\//i.test(u));
      return {id,url:own||`https://streamtape.com/v/${encodeURIComponent(id)}`,alternateUrls:c.links.filter(u=>u!==own)};
    }
    if(provider==='streamwish')return {id,url:c.links[0]||'',alternateUrls:c.links.slice(1)};
    if(provider==='filemoon'){
      const page=c.links.find(u=>/filemoon\.org\/.+\/file(?:[?#]|$)/.test(u));
      return {id,url:page||c.links[0]||'',alternateUrls:c.links.filter(u=>u!==page)};
    }
  }
  return null;
}

/** The file is streamed in 256KiB chunks, never loaded fully into memory. */
/** Stream multipart uploads; limit the read stream's range for FileMoon chunks. */
async function sendMultipart({filePath,size,provider,config,url,signal,onProgress,
  start=0,end=size-1,fields={},headers={}}) {
  const bytes=end-start+1;
  const {boundary,prefix,suffix,totalLength}=buildMultipartHeaders(filePath,bytes,provider,config,fields);
  let sent=0;
  async function* body(){
    yield prefix;
    const stream=fs.createReadStream(filePath,{start,end,highWaterMark:256*1024,signal});
    for await(const chunk of stream){sent+=chunk.length;onProgress(sent);yield chunk;}
    yield suffix;
  }
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,
    'Content-Length':String(totalLength),...headers},body:Readable.from(body()),signal,duplex:'half',redirect:'error'});
  const raw=await response.text();
  let data;
  try { data=raw.trim()?JSON.parse(raw):null; }
  catch {
    // Dropzone-style chunk endpoints may acknowledge intermediate pieces with
    // short plain text rather than JSON. Final completion still needs a file ID.
    const text=raw.trim();
    if(provider==='filemoon' && (!text || /^(?:ok|success|accepted|chunk\s+(?:received|uploaded|accepted))/i.test(text))) {
      data={};
    } else {
      const e=new Error(`${provider} returned an unexpected non-JSON response (HTTP ${response.status}). Check account before retrying.`);
      e.uncertain=true;throw e;
    }
  }
  if(!response.ok){
    const explanation=provider==='filemoon'?fileMoonError(data):'';
    const e=new Error(`${provider} HTTP ${response.status}${explanation?' — '+explanation:''}. Check account before retrying.`);
    e.uncertain=true;throw e;
  }
  if(provider==='filemoon') {
    // Preserve transport-level acknowledgement separately from FileMoon's
    // optional JSON fields; never treat this alone as final file completion.
    if(data===null) data={};
    if(typeof data!=='object'||Array.isArray(data)){
      const e=new Error('FileMoon returned unexpected response data. Check account before retrying.');e.uncertain=true;throw e;
    }
    return {...data,__httpStatus:response.status};
  }
  if(data===null){const e=new Error('Host returned an empty upload result; check host account before retrying.');e.uncertain=true;throw e;}
  return data;
}

function fileMoonError(data){
  if(!data || typeof data!=='object')return '';
  const code=typeof data.error?.code==='string'?data.error.code.slice(0,60).replace(/[^a-zA-Z0-9_ -]/g,''):'';
  const message=typeof data.error?.message==='string'?data.error.message
   :typeof data.error==='string'?data.error
   :typeof data.message==='string'?data.message:'';
  // Only short, printable diagnostics, not raw API responses or headers.
  const safeMessage=message.slice(0,180).replace(/[\r\n\x00-\x1f]/g,' ').replace(/(token|key|password)\s*[:=]\s*\S+/gi,'$1=[redacted]');
  const requestId=typeof data.request_id==='string'?data.request_id.slice(0,80).replace(/[^a-zA-Z0-9_-]/g,''):'';
  return [code,safeMessage,requestId?`request_id=${requestId}`:''].filter(Boolean).join(' · ');
}

function fileMoonChunkAccepted(data){
  if(!data || data.success===false || data.error || ['error','failed','failure','fail'].includes(String(data.status).toLowerCase()) || data.status===0 || data.status==='0')return false;
  if(data.success===true || data.success===1)return true;
  if(Number.isFinite(Number(data.status)) && Number(data.status)>=400)return false;
  // Non-final chunks can be accepted with HTTP 200/201/202 without the final
  // file metadata. Only the LAST chunk must include an actual file ID.
  return Number(data.__httpStatus)>=200 && Number(data.__httpStatus)<300;
}

function confirmed(provider,data) {
  if(provider==='filemoon')return fileMoonChunkAccepted(data);
  if(provider==='streamwish' && Array.isArray(data?.files) && data.files.some(f=>String(f.status).toUpperCase()!=='OK'))return false;
  return Number(data?.status)===200 || Number(data?.result?.status)===200;
}

/** FileMoon: use conservative 64 MiB chunks, below documented 90 MB edge threshold. */
export async function uploadFile({filePath,size,provider,config,url,signal,onProgress,
  filemoonChunkBytes=64*1024*1024}) {
  if(provider==='filemoon'){
    if(!Number.isInteger(filemoonChunkBytes)||filemoonChunkBytes<1)throw new Error('Invalid FileMoon chunk size');
    const chunks=Math.ceil(size/filemoonChunkBytes), uuid=randomUUID();
    let last;
    for(let i=0;i<chunks;i++){
      const offset=i*filemoonChunkBytes, length=Math.min(filemoonChunkBytes,size-offset);
      const fields={visibility:'1'};
      if(chunks>1)Object.assign(fields,{dzuuid:uuid,dzchunkindex:i,dztotalchunkcount:chunks,
        dzchunksize:filemoonChunkBytes,dztotalfilesize:size,dzchunkbyteoffset:offset});
      const data=await sendMultipart({filePath,size,provider,config,url,signal,
        start:offset,end:offset+length-1,fields,
        headers:{Authorization:`Bearer ${config.filemoonToken}`,Accept:'application/json'},
        onProgress:partSent=>onProgress(Math.min(99,Math.floor((offset+partSent)/size*100)),offset+partSent)});
      if(!confirmed(provider,data)){
        const detail=fileMoonError(data);
        const e=new Error(`FileMoon rejected chunk ${i+1}/${chunks}${detail?' — '+detail:''}. Check API token permissions and provider account.`);e.uncertain=true;throw e;
      }
      last=data;
    }
    const result=findResult(provider,last);
    if(!result){const e=new Error('FileMoon accepted data but no public file ID in final response. Check FileMoon files before retrying.');e.uncertain=true;throw e;}
    onProgress(100,size);return result;
  }
  const data=await sendMultipart({filePath,size,provider,config,url,signal,
    onProgress:sent=>onProgress(Math.min(99,Math.floor(sent/size*100)),sent)});
  if(!confirmed(provider,data)){
    const e=new Error(`Provider did not confirm upload success (status ${data?.status??'unknown'}).`);
    e.uncertain=true;throw e;
  }
  const result=findResult(provider,data);
  if(!result){const e=new Error('Provider upload response has no usable file ID. Check provider account before retrying.');e.uncertain=true;throw e;}
  onProgress(100,size);return result;
}
