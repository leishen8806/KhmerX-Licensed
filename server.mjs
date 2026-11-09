import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {handleEvent} from './lib/licensed-events.ts';

const mf=new Miniflare({modules:[{type:'ESModule',name:'index.js',path:fileURLToPath(new URL('./scripts/d1-worker.mjs',import.meta.url))}],d1Databases:{DB:'licensed'},d1Persist:false,compatibilityDate:'2026-05-15'});
const db=await mf.getD1Database('DB');
for(const statement of readFileSync(new URL('./drizzle/0001_licensed_core.sql',import.meta.url),'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
const env={DB,PARTNER_INBOUND_SECRETS_JSON:process.env.PARTNER_INBOUND_SECRETS_JSON||''};
for(const statement of readFileSync(new URL('./drizzle/0004_partner_outbox.sql',import.meta.url),'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
const server=createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/healthz'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true}));return;}
  if(req.method!=='POST'||req.url!=='/v0/events'){res.writeHead(404);res.end();return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request('http://127.0.0.1:8799/v0/events',{method:'POST',headers:req.headers,body:Buffer.concat(chunks)});
  const response=await handleEvent(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
});
server.listen(Number(process.env.PORT||8799),'127.0.0.1',()=>console.log('licensed service listening'));
