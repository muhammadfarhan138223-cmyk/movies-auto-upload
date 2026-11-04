import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataFile = path.join(root,'data','queue.json');
export const settingsFile = path.join(root,'data','settings.json');
export function loadConfig(envText=fs.existsSync(path.join(root,'.env')) ? fs.readFileSync(path.join(root,'.env'),'utf8') : '') {
 const values={...process.env};
 for(const line of envText.split(/\r?\n/)){
  const m=line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);if(!m)continue;
  let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);
  values[m[1]]=v;
 }
 const port=Number(values.PORT||8766);
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be 1024-65535');
 const syncUrl=(values.UPLOAD_SYNC_SUPABASE_URL||'').replace(/\/$/,'');
 if(syncUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(syncUrl))throw new Error('Supabase URL must be https://YOURPROJECT.supabase.co');
 return {streamtapeLogin:values.STREAMTAPE_LOGIN||'',streamtapeKey:values.STREAMTAPE_KEY||'',doodKey:values.DOODSTREAM_KEY||'', filemoonToken:values.FILEMOON_API_TOKEN||'', streamwishKey:values.STREAMWISH_API_KEY||'',
  syncUrl, syncAnonKey:values.UPLOAD_SYNC_PUBLISHABLE_KEY||'',
  syncAgentEmail:values.UPLOAD_SYNC_AGENT_EMAIL||'',syncAgentPassword:values.UPLOAD_SYNC_AGENT_PASSWORD||'', port};
}
