import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

if(String(process.env.PAYEASE_ENV||'').toLowerCase()!=='local')throw new Error('start requires PAYEASE_ENV=local');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const wrangler=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const child=spawn(process.execPath,[wrangler,'dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--inspector-port','0'],{cwd:root,stdio:'inherit',env:{...process.env,CLOUDFLARE_INCLUDE_PROCESS_ENV:'true'}});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('exit',(code,signal)=>process.exit(code??(signal?1:0)));
