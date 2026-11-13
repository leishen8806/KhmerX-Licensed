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

const root=new URL('./fixtures/arc04-v0/events/',import.meta.url),secret='test-only-secret-1',partnerBSecret='test-only-secret-2',now=1794000000;
const headers=(body,nonce='nonce-route-000001',key='idem-route-001',partner='partner-a',secretValue=secret)=>{const timestamp=String(now);return {'x-partner-id':partner,'x-timestamp':timestamp,'x-nonce':nonce,'x-idempotency-key':key,'x-signature':createHmac('sha256',secretValue).update([partner,timestamp,nonce,key,body].join('\n')).digest('hex')}};
const envFor=db=>({DB:db,PARTNER_INBOUND_SECRETS_JSON:JSON.stringify({'partner-a':secret,'partner-b':partnerBSecret})});
async function database(persist=false,migrate=true){
 const mf=new Miniflare({modules:[{type:'ESModule',name:'index.js',path:fileURLToPath(new URL('../scripts/d1-worker.mjs',import.meta.url))}],d1Databases:{DB:'licensed'},d1Persist:persist||false,compatibilityDate:'2026-05-15'}),db=await mf.getD1Database('DB');
 if(migrate)for(const file of ['0001_licensed_core.sql','0004_approval.sql'])for(const statement of readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8').split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
 return {mf,db};
}
async function send(db,body,nonce='nonce-route-000001',key='idem-route-001',partner='partner-a'){const secretValue=partner==='partner-b'?partnerBSecret:secret;return handleEvent(new Request('http://127.0.0.1/v0/events',{method:'POST',headers:{'content-type':'application/json',...headers(body,nonce,key,partner,secretValue)},body}),envFor(db),now);}

test('licensed D1 receiver accepts the three outbound event samples and rejects others',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 const submitted=await readFile(new URL('application.submitted.json',root),'utf8');assert.equal((await send(db,submitted,'nonce-submitted-0001','idem-application-submitted')).status,202);
 await db.prepare("UPDATE applications SET status='approved' WHERE id='app-001'").run();
 const signed=await readFile(new URL('agreement.signed.json',root),'utf8');assert.equal((await send(db,signed,'nonce-signed-000001','idem-agreement-signed')).status,202);
 const withdrawn=await readFile(new URL('application.withdrawn.json',root),'utf8');assert.equal((await send(db,withdrawn,'nonce-withdrawn-0001','idem-application-withdrawn')).status,409);
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

test('applications and event history are isolated by partner',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 const submitted=JSON.stringify({eventType:'application.submitted',applicationId:'shared-app',customerRef:'synthetic-a'});
 const first=await send(db,submitted,'nonce-partner-a-01','idem-a-000001','partner-a');assert.equal(first.status,202);await db.prepare("UPDATE applications SET status='approved' WHERE id='shared-app' AND partner_id='partner-a'").run();
 const cross=JSON.stringify({eventType:'agreement.signed',applicationId:'shared-app'});
 for(const eventType of ['agreement.signed','application.withdrawn']){
  const safe=eventType.replaceAll('.','-');
  const response=await send(db,JSON.stringify({eventType,applicationId:'shared-app'}),`nonce-b-${safe}-001`,`idem-b-${safe}-01`,'partner-b');
  assert.equal(response.status,409);assert.equal((await response.json()).code,'APPLICATION_NOT_FOUND');
 }
 assert.equal((await send(db,cross,'nonce-a-sign-001','idem-a-sign-01','partner-a')).status,202);
 const app=await db.prepare('SELECT partner_id,status,payload FROM applications WHERE id=? AND partner_id=?').bind('shared-app','partner-a').first();
 assert.equal(app.partner_id,'partner-a');assert.equal(app.status,'signed');assert.match(app.payload,/customerRef/);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM application_events').first()).n,1);
});

test('application state transitions preserve submitted payload and enforce closure',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 const submitted=JSON.stringify({eventType:'application.submitted',applicationId:'state-app',amountCents:1200});
 assert.equal((await send(db,submitted,'nonce-state-sub-1','idem-state-sub-1')).status,202);await db.prepare("UPDATE applications SET status='approved' WHERE id='state-app'").run();
 const duplicate=await send(db,submitted,'nonce-state-sub-2','idem-state-sub-2');assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).code,'APPLICATION_EXISTS');
 assert.equal((await send(db,JSON.stringify({eventType:'agreement.signed',applicationId:'state-app',signedAt:'synthetic'}),'nonce-state-sign-1','idem-state-sign-1')).status,202);
 assert.equal((await send(db,JSON.stringify({eventType:'application.withdrawn',applicationId:'state-app',reason:'synthetic'}),'nonce-state-with-1','idem-state-with-1')).status,409);
 const after=await db.prepare('SELECT status,payload FROM applications WHERE partner_id=? AND id=?').bind('partner-a','state-app').first();assert.equal(after.status,'signed');assert.match(after.payload,/amountCents/);assert.doesNotMatch(after.payload,/signedAt/);
 const closed=await send(db,JSON.stringify({eventType:'agreement.signed',applicationId:'state-app'}),'nonce-state-closed-1','idem-state-closed-1');assert.equal(closed.status,409);assert.equal((await closed.json()).code,'APPLICATION_STATE_INVALID');
 const events=await db.prepare('SELECT event_type FROM application_events WHERE partner_id=? AND application_id=? ORDER BY created_at').bind('partner-a','state-app').all();assert.deepEqual(events.results.map(row=>row.event_type),['agreement.signed']);
});

test('withdrawal is allowed from submitted pending_check and approved, then idempotent',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 for(const [id,status] of [['withdraw-submitted-0001','submitted'],['withdraw-pending-0001','pending_check'],['withdraw-approved-0001','approved']]){
  assert.equal((await send(db,JSON.stringify({eventType:'application.submitted',applicationId:id}),`nonce-${id}-sub`,`idem-${id}-sub`)).status,202);
  if(status!=='submitted')await db.prepare('UPDATE applications SET status=? WHERE id=?').bind(status,id).run();
  assert.equal((await send(db,JSON.stringify({eventType:'application.withdrawn',applicationId:id}),`nonce-${id}-with`,`idem-${id}-with`)).status,202);
  assert.equal((await db.prepare('SELECT status FROM applications WHERE id=?').bind(id).first()).status,'withdrawn');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM application_events WHERE application_id=?').bind(id).first()).n,1);
  assert.equal((await send(db,JSON.stringify({eventType:'application.withdrawn',applicationId:id}),`nonce-${id}-retry`,`idem-${id}-retry`)).status,200);
 }
 const signedId='w-signed';assert.equal((await send(db,JSON.stringify({eventType:'application.submitted',applicationId:signedId}),'nonce-w-signed-sub','idem-w-signed-sub')).status,202);await db.prepare("UPDATE applications SET status='signed' WHERE id=?").bind(signedId).run();assert.equal((await send(db,JSON.stringify({eventType:'application.withdrawn',applicationId:signedId}),'nonce-w-signed-with','idem-w-signed-with')).status,409);
});

test('concurrent writes convert nonce and idempotency races to non-500 responses',async t=>{
 const {mf,db}=await database();t.after(()=>mf.dispose());
 const requests=['race-one','race-two'].map((applicationId,index)=>send(db,JSON.stringify({eventType:'application.submitted',applicationId}),`nonce-race-shared`,`idem-race-${index}-01`));
 const responses=await Promise.all(requests),statuses=await Promise.all(responses.map(async response=>({status:response.status,body:await response.json()})));
 assert.equal(statuses.filter(item=>item.status===202).length,1);assert.equal(statuses.some(item=>item.status===409&&item.body.code==='NONCE_REPLAY'),true);assert.equal(statuses.some(item=>item.status===500),false);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM nonces').first()).n,1);
});
