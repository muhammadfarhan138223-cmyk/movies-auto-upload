import fs from 'node:fs';
const url=process.env.UPLOAD_SUPABASE_URL;
const key=process.env.UPLOAD_SUPABASE_PUBLISHABLE_KEY;
if(!url||!key||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)){
 console.error('Missing GitHub variables UPLOAD_SUPABASE_URL / UPLOAD_SUPABASE_PUBLISHABLE_KEY');process.exit(1);
}
const value=`window.MH_CONFIG = ${JSON.stringify({supabaseUrl:url,publishableKey:key},null,2)};\n`;
fs.writeFileSync(new URL('../mobile/config.js',import.meta.url),value);
console.log('Created public mobile configuration (secrets NOT included).');
