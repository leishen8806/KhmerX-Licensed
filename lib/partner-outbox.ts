import {signInstitutionCallback} from './institution-callback.ts';

import {auditInsertSql} from './team/audit-writer.ts';

type DB=Pick<D1Database,'prepare'|'batch'>;
type Env=Record<string,unknown> & {DB?:D1Database};
type EventType='loan.approved'|'loan.rejected'|'funding.confirmed'|'repayment.confirmed'|'payment.failed';
type EventInput={partnerId:string;eventType:EventType;eventId:string;applicationId:string;occurredAt:string;reason?:string;externalReference?:string;amountCents?:number;paymentType?:string};
type OutboxRow={id:string;partner_id:string;payload:string;idempotency_key:string;attempts:number;created_at:string;retry_since:string};

const config=(env:Env,name:string)=>{try{const parsed=JSON.parse(String(env[name]||''));return parsed&&typeof parsed==='object'?parsed as Record<string,string>:{};}catch{return {};}};
const endpoint=(env:Env,id:string)=>{const raw=config(env,'PARTNER_ENDPOINTS_JSON')[id];if(typeof raw!=='string')return null;try{const url=new URL(raw);if(url.protocol==='https:')return url;const localHttp=String(env.PAYEASE_ENV||'')==='local'&&url.protocol==='http:'&&(url.hostname==='127.0.0.1'||url.hostname==='localhost')&&!url.username&&!url.password;return localHttp?url:null;}catch{return null;}};
const secret=(env:Env,id:string)=>{const value=config(env,'PARTNER_OUTBOUND_SECRETS_JSON')[id];return typeof value==='string'?value:'';};
const sender=(env:Env,id:string)=>{const value=config(env,'PARTNER_SENDER_IDS_JSON')[id];return typeof value==='string'&&value?value:'';};
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');

export async function buildPartnerEvent(input:EventInput){
 const payload:Record<string,unknown>={eventType:input.eventType,eventId:input.eventId,applicationId:input.applicationId,occurredAt:input.occurredAt};
 if(input.reason!==undefined)payload.reason=input.reason;
 if(input.externalReference!==undefined)payload.externalReference=input.externalReference;
 if(input.amountCents!==undefined)payload.amountCents=input.amountCents;
 if(input.paymentType!==undefined)payload.paymentType=input.paymentType;
 return JSON.stringify(payload);
}

export async function partnerOutboxInsert(db:DB,input:EventInput,options:{unconditional?:boolean}={}){
 const body=await buildPartnerEvent(input),now=input.occurredAt;
 const sql=options.unconditional?"INSERT OR IGNORE INTO partner_outbox(id,partner_id,event_type,idempotency_key,payload,payload_sha256,status,attempts,next_attempt_at,lease_until,last_error,created_at,delivered_at) VALUES(?,?,?,?,?,?, 'pending',0,0,NULL,NULL,?,NULL)":"INSERT OR IGNORE INTO partner_outbox(id,partner_id,event_type,idempotency_key,payload,payload_sha256,status,attempts,next_attempt_at,lease_until,last_error,created_at,delivered_at) SELECT ?,?,?,?,?,?, 'pending',0,0,NULL,NULL,?,NULL WHERE changes()=1";
 return db.prepare(sql).bind(crypto.randomUUID(),input.partnerId,input.eventType,`${input.eventType}:${input.eventId}`,body,await sha256(body),now);
}

export async function dispatchPartnerOutbox(env:Env,now=new Date().toISOString(),fetcher:typeof fetch=fetch){
 if(String(env.PARTNER_OUTBOX||'').toLowerCase()!=='on'||!env.DB)return {sent:0,dead:0};
 const db=env.DB,nowMs=Date.parse(now);await db.prepare("UPDATE partner_outbox SET status='pending',lease_until=NULL WHERE status='sending' AND lease_until IS NOT NULL AND lease_until<=?").bind(nowMs).run();
 const rows=(await db.prepare("SELECT *,COALESCE(requeued_at,created_at) AS retry_since FROM partner_outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at,id LIMIT 20").bind(nowMs).all<OutboxRow>()).results;let sent=0,dead=0;
 for(const row of rows){const claim=await db.prepare("UPDATE partner_outbox SET status='sending',attempts=attempts+1,lease_until=? WHERE id=? AND status='pending' AND attempts=?").bind(nowMs+300000,row.id,row.attempts).run();if(!claim.meta.changes)continue;const url=endpoint(env,row.partner_id),key=secret(env,row.partner_id),senderId=sender(env,row.partner_id);
  if(!url||!key||!senderId){await db.prepare("UPDATE partner_outbox SET status='dead',lease_until=NULL,last_error=? WHERE id=? AND status='sending'").bind(!url?'PARTNER_ENDPOINT_INVALID':!key?'PARTNER_OUTBOUND_SECRET_MISSING':'PARTNER_SENDER_ID_MISSING',row.id).run();dead++;continue;}
  const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);const nonce=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),timestamp=String(Math.floor(nowMs/1000));const signature=await signInstitutionCallback(key,{institutionId:senderId,timestamp,nonce,body:row.payload,idempotencyKey:row.idempotency_key});let status=0;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  let responseCode='';
  try{const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','x-partner-id':senderId,'x-institution-id':senderId,'x-timestamp':timestamp,'x-nonce':nonce,'x-idempotency-key':row.idempotency_key,'x-signature':signature},body:row.payload,signal:controller.signal});status=response.status;try{const body=await response.clone().json() as {code?:unknown};const code=typeof body.code==='string'?body.code:'';if(/^[A-Z0-9_]{1,64}$/.test(code))responseCode=code;}catch{}}catch{}finally{clearTimeout(timer);}
  if((status>=200&&status<300)||status===409){await db.prepare("UPDATE partner_outbox SET status='delivered',lease_until=NULL,last_error=?,delivered_at=? WHERE id=? AND status='sending'").bind(status===409?'HTTP_409':null,now,row.id).run();sent++;continue;}
  const error=status?`HTTP_${status}${responseCode?`:${responseCode}`:''}`:'TIMEOUT';
  if(Date.parse(row.retry_since)+86400000<=nowMs){await db.prepare("UPDATE partner_outbox SET status='dead',lease_until=NULL,last_error=? WHERE id=? AND status='sending'").bind(error,row.id).run();dead++;continue;}
  const delay=Math.min(300,30*2**Math.max(0,row.attempts-1));await db.prepare("UPDATE partner_outbox SET status='pending',lease_until=NULL,last_error=?,next_attempt_at=? WHERE id=? AND status='sending'").bind(error,nowMs+delay*1000,row.id).run();
 }
 return {sent,dead};
}

type Actor={id:string;email?:string;role:string};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const auditAction='partner_outbox_requeue';
const priorRequest="FROM team_audit WHERE tenant_id='institution' AND action=? AND json_extract(detail,'$.requestId')=?";

export async function listDeadPartnerOutbox(db:DB,actor:Actor){
 if(actor.role!=='admin')return json({code:'ROLE_FORBIDDEN'},403);
 const {results}=await db.prepare("SELECT id,event_type,partner_id,attempts,last_error,created_at,requeued_at,requeue_count FROM partner_outbox WHERE status='dead' ORDER BY created_at DESC,id LIMIT 200").all();
 return json({items:results});
}

export async function requeuePartnerOutbox(db:DB,actor:Actor,input:Record<string,unknown>){
 if(actor.role!=='admin')return json({code:'ROLE_FORBIDDEN'},403);
 const {action,id,requestId}=input;
 const reason=typeof input.reason==='string'?input.reason.trim().slice(0,300):'';
 if(!reason)return json({code:'REASON_REQUIRED'},400);
 if(action!=='requeue'||typeof id!=='string'||!id||id.length>120||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{8,120}$/.test(requestId))return json({code:'INVALID_REQUEST'},400);
 const now=new Date().toISOString();
 const [update]=await db.batch([
  db.prepare(`UPDATE partner_outbox SET status='pending',attempts=0,next_attempt_at=?,lease_until=NULL,requeued_at=?,requeue_count=requeue_count+1 WHERE id=? AND status='dead' AND NOT EXISTS (SELECT 1 ${priorRequest})`).bind(Date.parse(now),now,id,auditAction,requestId),
  auditInsertSql(db,'institution',actor.email||actor.id,auditAction,{recordId:id,reason,requestId},undefined,'changed',now)
 ]);
 if(update.meta.changes===1)return json({ok:true,id,requestId});
 const existing=await db.prepare(`SELECT json_extract(detail,'$.recordId') AS record_id ${priorRequest} LIMIT 1`).bind(auditAction,requestId).first<{record_id:string}>();
 if(!existing)return json({code:'OUTBOX_NOT_DEAD'},409);
 if(existing.record_id!==id)return json({code:'REQUEST_ID_REUSED'},409);
 return json({ok:true,idempotent:true,requestId});
}
