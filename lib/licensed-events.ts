import {createHash} from 'node:crypto';
import {verifyInstitutionCallback} from './institution-callback.ts';
import {auditInsertSql} from './team/audit-writer.ts';

const ACCEPTED=new Set(['application.submitted','agreement.signed','application.withdrawn']);
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
type EventPayload={eventType?:string;applicationId?:string;[key:string]:unknown};

function secrets(env:Record<string,unknown>){
 try{const parsed=JSON.parse(String(env.PARTNER_INBOUND_SECRETS_JSON||''));return parsed&&typeof parsed==='object'?parsed as Record<string,string>:{};}catch{return {};}
}
function isUnique(error:unknown,table:string){return error instanceof Error&&error.message.toLowerCase().includes('unique')&&error.message.toLowerCase().includes(table);}

export async function handleEvent(request:Request,env:Record<string,unknown>,now=Math.floor(Date.now()/1000)){
 const partner=request.headers.get('x-partner-id')||request.headers.get('x-institution-id')||'';
 const legacy=request.headers.get('x-institution-id');
 if(request.headers.get('x-partner-id')&&legacy&&request.headers.get('x-partner-id')!==legacy)return json({code:'CALLBACK_HEADERS_INVALID'},400);
 const timestamp=request.headers.get('x-timestamp')||'',nonce=request.headers.get('x-nonce')||'',idempotency=request.headers.get('x-idempotency-key')||'',signature=request.headers.get('x-signature')||'';
 if(!partner||idempotency.length<8||idempotency.length>120)return json({code:'INVALID_HEADERS'},400);
 const body=await request.text(),secret=secrets(env)[partner];
 if(!secret||!await verifyInstitutionCallback(secret,{institutionId:partner,timestamp,nonce,idempotencyKey:idempotency,body,signature},now))return json({code:'SIGNATURE_INVALID'},401);
 let payload:EventPayload;try{payload=JSON.parse(body) as EventPayload;}catch{return json({code:'INVALID_JSON'},400);}
 const eventType=payload.eventType,applicationId=payload.applicationId;
 if(typeof eventType!=='string'||!ACCEPTED.has(eventType))return json({code:'EVENT_NOT_ACCEPTED'},400);
 if(typeof applicationId!=='string'||!applicationId)return json({code:'EVENT_INVALID'},400);
 const db=env.DB as D1Database,hash=createHash('sha256').update(body).digest('hex');
 const prior=await db.prepare('SELECT body_sha256,response_body FROM inbound_events WHERE idempotency_key=? AND partner_id=?').bind(idempotency,partner).first<{body_sha256:string;response_body:string}>();
 if(prior)return prior.body_sha256===hash?json({...JSON.parse(prior.response_body),duplicate:true},200):json({code:'IDEMPOTENCY_CONFLICT'},409);
 const replay=await db.prepare('SELECT nonce FROM nonces WHERE nonce=? AND partner_id=?').bind(nonce,partner).first();
 if(replay)return json({code:'NONCE_REPLAY'},409);
 const existing=await db.prepare('SELECT status FROM applications WHERE id=? AND partner_id=?').bind(applicationId,partner).first<{status:string}>();
 if(eventType==='application.submitted'){
  if(existing)return json({code:existing.status==='withdrawn'?'APPLICATION_CLOSED':'APPLICATION_EXISTS'},409);
 } else {
  if(!existing)return json({code:'APPLICATION_NOT_FOUND'},409);
  if(eventType==='application.withdrawn'){
   if(existing.status==='withdrawn')return json({ok:true,accepted:true,applicationId,duplicate:true},200);
   if(!['submitted','pending_check','approved'].includes(existing.status))return json({code:'APPLICATION_NOT_WITHDRAWABLE'},409);
  }else{
   if(existing.status==='withdrawn')return json({code:'APPLICATION_CLOSED'},409);
   if(eventType==='agreement.signed'&&existing.status!=='approved')return json({code:'APPLICATION_STATE_INVALID'},409);
  }
 }
 const nowIso=new Date().toISOString(),response={ok:true,accepted:true,applicationId};
 const appStatus=eventType==='application.submitted'?'submitted':eventType==='agreement.signed'?'signed':'withdrawn';
 const appStatement=eventType==='application.submitted'
  ?db.prepare('INSERT INTO applications (partner_id,id,status,payload,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(partner,applicationId,appStatus,body,nowIso,nowIso)
  :db.prepare('UPDATE applications SET status=?,updated_at=? WHERE id=? AND partner_id=?').bind(appStatus,nowIso,applicationId,partner);
 const eventStatement=eventType==='application.submitted'?null:db.prepare('INSERT INTO application_events (partner_id,application_id,event_type,payload,created_at) VALUES (?,?,?,?,?)').bind(partner,applicationId,eventType,body,nowIso);
 const inbound=db.prepare('INSERT INTO inbound_events (partner_id,idempotency_key,body_sha256,response_status,response_body,created_at) VALUES (?,?,?,?,?,?)').bind(partner,idempotency,hash,202,JSON.stringify(response),nowIso);
 const nonceStatement=db.prepare('INSERT INTO nonces (partner_id,nonce,created_at) VALUES (?,?,?)').bind(partner,nonce,nowIso);
 const audit=auditInsertSql(db,'licensed',partner,eventType,{applicationId,partnerId:partner},crypto.randomUUID(),'always',nowIso);
 try{await db.batch([appStatement,nonceStatement,inbound,...(eventStatement?[eventStatement]:[]),audit]);}
 catch(error){
  if(isUnique(error,'nonces'))return json({code:'NONCE_REPLAY'},409);
  if(isUnique(error,'inbound_events')){
   const raced=await db.prepare('SELECT body_sha256,response_body FROM inbound_events WHERE idempotency_key=? AND partner_id=?').bind(idempotency,partner).first<{body_sha256:string;response_body:string}>();
   if(raced&&raced.body_sha256===hash)return json({...JSON.parse(raced.response_body),duplicate:true},200);
   return json({code:'IDEMPOTENCY_CONFLICT'},409);
  }
  if(isUnique(error,'applications'))return json({code:'APPLICATION_EXISTS'},409);
  throw error;
 }
 return json(response,202);
}
