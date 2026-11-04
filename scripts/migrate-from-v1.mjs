/** Copy existing .env and queue.json from V1 without overwriting any existing V2 files. */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { root } from '../src/config.mjs';
const from=process.argv[2];
if(!from){console.error('Usage: node scripts/migrate-from-v1.mjs "C:\\path\\to\\MovieHub_Auto_Uploader"');process.exit(1)}
for(const relative of ['.env',path.join('data','queue.json')]){
 const source=path.join(path.resolve(from),relative);const destination=path.join(root,relative);
 try{
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(source,destination,constants.COPYFILE_EXCL);
  console.log('Copied',relative,'(private, git-ignored)');
 }catch(e){if(e.code==='EEXIST')console.log('Skipping',relative,'because V2 already has it');
 else if(e.code==='ENOENT')console.log('Not present in V1:',relative);
 else{console.error(relative+': '+e.message);process.exitCode=1;}}
}
console.log('V1 has NOT been modified. Do not delete it until V2 passes a test upload.');
