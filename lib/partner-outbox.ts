import {signInstitutionCallback} from './institution-callback.ts';

type DB=Pick<D1Database,'prepare'|'batch'>;
type Env=Record<string,unknown> & {DB?:D1Database};
type EventType='loan.approved'|'loan.rejected'|'funding.confirmed'|'repayment.confirmed'|'payment.failed';
type EventInput={tenantId:string;institutionId:string;eventType:EventType;eventId:string;applicationId:string;occurredAt:string;reason?:string;externalReference?:string;amountCents?:number;paymentType?:string};
type OutboxRow={id:string;institution_id:string;payload:string;idempotency_key:string;attempts:number;created_at:string};

const config=(env:Env,name:string)=>{try{const parsed=JSON.parse(String(env[name]||''));return parsed&&typeof parsed==='object'?parsed as Record<string,string>:{};}catch{return {};}};
const endpoint=(env:Env,id:string)=>{const raw=config(env,'PARTNER_ENDPOINTS_JSON')[id];if(typeof raw!=='string')return null;try{const url=new URL(raw);return url.protocol==='https:'?url:null;}catch{return null;}};
const secret=(env:Env,id:string)=>{const value=config(env,'PARTNER_OUTBOUND_SECRETS_JSON')[id];return typeof value==='string'?value:'';};
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const external=(env:Env)=>String(env.PAYEASE_INSTITUTION_MODE||'').toLowerCase()==='external';

export async function buildPartnerEvent(input:EventInput){
 const payload:Record<string,unknown>={eventType:input.eventType,eventId:input.eventId,applicationId:input.applicationId,occurredAt:input.occurredAt};
 if(input.reason!==undefined)payload.reason=input.reason;
 if(input.externalReference!==undefined)payload.externalReference=input.externalReference;
 if(input.amountCents!==undefined)payload.amountCents=input.amountCents;
 if(input.paymentType!==undefined)payload.paymentType=input.paymentType;
 return JSON.stringify(payload);
}

export async function partnerOutboxInsert(db:DB,input:EventInput,env:Env){
 const body=await buildPartnerEvent(input),now=input.occurredAt;
 return db.prepare("INSERT OR IGNORE INTO partner_outbox(id,tenant_id,institution_id,event_type,idempotency_key,payload,payload_sha256,status,attempts,next_attempt_at,lease_until,last_error,created_at,delivered_at) SELECT ?,?,?,?,?,?,?, 'pending',0,0,NULL,NULL,?,NULL WHERE ?='external' AND changes()=1").bind(crypto.randomUUID(),input.tenantId,input.institutionId,input.eventType,`${input.eventType}:${input.eventId}`,body,await sha256(body),now,String(env.PAYEASE_INSTITUTION_MODE||'').toLowerCase());
}

export async function dispatchPartnerOutbox(env:Env,now=new Date().toISOString(),fetcher:typeof fetch=fetch){
 if(!external(env)||String(env.PARTNER_OUTBOX||'').toLowerCase()!=='on'||!env.DB)return {sent:0,dead:0};
 const db=env.DB,nowMs=Date.parse(now);await db.prepare("UPDATE partner_outbox SET status='pending',lease_until=NULL WHERE status='sending' AND lease_until IS NOT NULL AND lease_until<=?").bind(nowMs).run();
 const rows=(await db.prepare("SELECT * FROM partner_outbox WHERE status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at,id LIMIT 20").bind(nowMs).all<OutboxRow>()).results;let sent=0,dead=0;
 for(const row of rows){const claim=await db.prepare("UPDATE partner_outbox SET status='sending',attempts=attempts+1,lease_until=? WHERE id=? AND status='pending' AND attempts=?").bind(nowMs+300000,row.id,row.attempts).run();if(!claim.meta.changes)continue;const url=endpoint(env,row.institution_id),key=secret(env,row.institution_id);
  if(!url||!key){await db.prepare("UPDATE partner_outbox SET status='dead',lease_until=NULL,last_error=? WHERE id=? AND status='sending'").bind(!url?'PARTNER_ENDPOINT_INVALID':'PARTNER_OUTBOUND_SECRET_MISSING',row.id).run();dead++;continue;}
  const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);const nonce=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),timestamp=String(Math.floor(nowMs/1000));const signature=await signInstitutionCallback(key,{institutionId:row.institution_id,timestamp,nonce,body:row.payload,idempotencyKey:row.idempotency_key});let status=0;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','x-partner-id':row.institution_id,'x-institution-id':row.institution_id,'x-timestamp':timestamp,'x-nonce':nonce,'x-idempotency-key':row.idempotency_key,'x-signature':signature},body:row.payload,signal:controller.signal});status=response.status;}catch{}finally{clearTimeout(timer);}
  if((status>=200&&status<300)||status===409){await db.prepare("UPDATE partner_outbox SET status='delivered',lease_until=NULL,last_error=?,delivered_at=? WHERE id=? AND status='sending'").bind(status===409?'HTTP_409':null,now,row.id).run();sent++;continue;}
  if(Date.parse(row.created_at)+86400000<=nowMs){await db.prepare("UPDATE partner_outbox SET status='dead',lease_until=NULL,last_error=? WHERE id=? AND status='sending'").bind(status?`HTTP_${status}`:'TIMEOUT',row.id).run();dead++;continue;}
  const delay=Math.min(3600,30*2**Math.max(0,row.attempts-1));await db.prepare("UPDATE partner_outbox SET status='pending',lease_until=NULL,last_error=?,next_attempt_at=? WHERE id=? AND status='sending'").bind(status?`HTTP_${status}`:'TIMEOUT',nowMs+delay*1000,row.id).run();
 }
 return {sent,dead};
}
