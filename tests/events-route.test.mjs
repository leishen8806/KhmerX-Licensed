import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {handleEvent} from '../lib/licensed-events.ts';

const root=new URL('./fixtures/arc04-v0/events/',import.meta.url),secret='test-only-secret-1',now=1794000000;
const headers=(body,nonce='nonce-route-000001',key='idem-route-001')=>{const partner='partner-a',timestamp=String(now);return {'x-partner-id':partner,'x-timestamp':timestamp,'x-nonce':nonce,'x-idempotency-key':key,'x-signature':createHmac('sha256',secret).update([partner,timestamp,nonce,key,body].join('\n')).digest('hex')}};
const envFor=db=>({DB:db,PARTNER_INBOUND_SECRETS_JSON:JSON.stringify({'partner-a':secret})});
async function database(persist=false,migrate=true){
 const mf=new Miniflare({modules:[{type:'ESModule',name:'index.js',path:fileURLToPath(new URL('../scripts/d1-worker.mjs',import.meta.url))}],d1Databases:{DB:'licensed'},d1Persist:persist||false,compatibilityDate:'2026-05-15'}),db=await mf.getD1Database('DB');
 if(migrate)for(const statement of readFileSync(new URL('../drizzle/0001_licensed_core.sql',import.meta.url),'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
 return {mf,db};
}
async function send(db,body,nonce='nonce-route-000001',key='idem-route-001'){return handleEvent(new Request('http://127.0.0.1/v0/events',{method:'POST',headers:{'content-type':'application/json',...headers(body,nonce,key)},body}),envFor(db),now);}

test('licensed D1 receiver accepts the three outbound event samples and rejects others',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 for(const [name,nonce] of [['application.submitted','nonce-submitted-0001'],['agreement.signed','nonce-signed-000001'],['application.withdrawn','nonce-withdrawn-0001']]){
  const body=await readFile(new URL(`${name}.json`,root),'utf8');assert.equal((await send(db,body,nonce,`idem-${name.replaceAll('.','-')}`)).status,202,name);
 }
 for(const name of ['loan.approved','loan.rejected','funding.confirmed','repayment.confirmed','payment.failed']){
  const body=await readFile(new URL(`${name}.json`,root),'utf8'),response=await send(db,body,`nonce-${name.replaceAll('.','-')}-001`,`idem-${name.replaceAll('.','-')}`);assert.equal(response.status,400,name);assert.equal((await response.json()).code,'EVENT_NOT_ACCEPTED');
 }
});

test('signed and withdrawn unknown applications return 409',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 for(const eventType of ['agreement.signed','application.withdrawn']){const body=JSON.stringify({eventType,applicationId:'missing-app'}),response=await send(db,body,`nonce-missing-${eventType.replace('.','-')}-01`,`idem-missing-${eventType.replace('.','-')}`);assert.equal(response.status,409);}
});

test('D1 idempotency and nonce replay survive a Miniflare restart',async t=>{
 const persist=await mkdtemp(join(tmpdir(),'licensed-d1-')),first=await database(persist),body=JSON.stringify({eventType:'application.submitted',applicationId:'app-restart-001'});assert.equal((await send(first.db,body)).status,202);await first.mf.dispose();const second=await database(persist,false);assert.equal((await second.db.prepare('SELECT COUNT(*) AS n FROM inbound_events').first()).n,1);assert.equal((await send(second.db,body,'nonce-route-000002')).status,200);assert.equal((await send(second.db,body,'nonce-route-000001','idem-route-002')).status,409);t.after(async()=>{await second.mf.dispose();await rm(persist,{recursive:true,force:true});});
});
