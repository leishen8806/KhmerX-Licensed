import {execFile} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

if(String(process.env.PAYEASE_ENV||'').toLowerCase()!=='local')throw new Error('migrate:local requires PAYEASE_ENV=local');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const run=promisify(execFile);
const files=await readdir(resolve(root,'drizzle'),{withFileTypes:true});
for(const file of files.filter(entry=>entry.isFile()&&entry.name.endsWith('.sql')).map(entry=>entry.name).sort()){
  await run(process.execPath,[wrangler,'d1','execute','DB','--local','--persist-to','.wrangler/state','--config','dist/server/wrangler.json','--file',`drizzle/${file}`],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  console.log(`applied ${file}`);
}
