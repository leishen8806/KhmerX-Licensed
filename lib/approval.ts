/* eslint-disable @typescript-eslint/no-explicit-any */
import {auditInsertSql} from './team/audit-writer.ts';
import {partnerOutboxInsert} from './partner-outbox.ts';
import {AuthError} from './http/errors.ts';

type DB={prepare(sql:string):any;batch(statements:any[]):Promise<any[]>};
export type Actor={id:string;email?:string;role:string};
type Action='approve'|'reject'|'review_approve'|'review_return';
const json=(body:unknown,status=200)=>Response.json(body,{status});
const now=()=>new Date().toISOString();
function requireRole(actor:Actor,action:Action){const role=action==='approve'||action==='reject'?'lender':'checker';if(actor.role!==role)throw new AuthError('无权执行此操作',403,undefined,'ROLE_FORBIDDEN');}

export async function listApplications(db:DB,partnerId:string,status:string|null,limit=50){const size=Math.min(100,Math.max(1,Number(limit)||50));const query=status?'SELECT * FROM applications WHERE partner_id=? AND status=? ORDER BY updated_at DESC,id LIMIT ?':'SELECT * FROM applications WHERE partner_id=? ORDER BY updated_at DESC,id LIMIT ?';const result=await db.prepare(query).bind(...(status?[partnerId,status,size]:[partnerId,size])).all();return result.results;}
export async function applicationDetail(db:DB,partnerId:string,id:string){return db.prepare('SELECT * FROM applications WHERE partner_id=? AND id=?').bind(partnerId,id).first();}

export async function applyDecision(db:DB,actor:Actor,input:Record<string,unknown>){
 const action=String(input.action||'') as Action,partnerId=String(input.partnerId||''),applicationId=String(input.applicationId||''),requestId=String(input.requestId||''),reason=typeof input.reason==='string'?input.reason.trim():'';const version=Number(input.version);if(!['approve','reject','review_approve','review_return'].includes(action)||!partnerId||!applicationId||!requestId||!Number.isSafeInteger(version))return json({code:'INVALID_REQUEST'},400);requireRole(actor,action);if((action==='reject'||action==='review_return')&&!reason)return json({code:'REASON_REQUIRED'},400);
 const prior=await db.prepare('SELECT response_status,response_body FROM approval_requests WHERE actor_id=? AND request_id=?').bind(actor.id,requestId).first();if(prior)return new Response(prior.response_body,{status:prior.response_status,headers:{'content-type':'application/json'}});
 const row=await db.prepare('SELECT * FROM applications WHERE partner_id=? AND id=?').bind(partnerId,applicationId).first();if(!row)return json({code:'APPLICATION_NOT_FOUND'},404);if(row.status==='withdrawn')return json({code:'APPLICATION_STATE_INVALID'},409);
 if(action==='review_approve'&&row.approved_by===actor.id)return json({code:'REVIEWER_MUST_DIFFER'},409);if(['approve','reject'].includes(action)&&row.status!=='submitted')return json({code:'APPLICATION_STATE_INVALID'},409);if(['review_approve','review_return'].includes(action)&&row.status!=='pending_check')return json({code:'APPLICATION_STATE_INVALID'},409);
 const stamp=now();let nextStatus:string,decision:string=row.decision,checkedBy:string|null=row.checked_by,approvedBy:string|null=row.approved_by,reasonValue:string|null=reason||row.reject_reason,checkedAt:string|null=row.checked_at,decidedAt:string|null=row.decided_at;
 if(action==='approve'){nextStatus='pending_check';decision='approved';approvedBy=actor.id;decidedAt=stamp;}else if(action==='reject'){nextStatus='rejected';decision='rejected';approvedBy=actor.id;decidedAt=stamp;}else if(action==='review_approve'){nextStatus='approved';checkedBy=actor.id;checkedAt=stamp;reasonValue=null;}else{nextStatus='submitted';decision='none';checkedBy=actor.id;checkedAt=stamp;approvedBy=null;decidedAt=null;}
 const response={ok:true,partnerId,applicationId,status:nextStatus,version:row.version+1};const update=db.prepare('UPDATE applications SET status=?,decision=?,approved_by=?,checked_by=?,reject_reason=?,decided_at=?,checked_at=?,version=version+1,updated_at=? WHERE partner_id=? AND id=? AND version=? AND status=?').bind(nextStatus,decision,approvedBy,checkedBy,reasonValue,decidedAt,checkedAt,stamp,partnerId,applicationId,version,row.status);
 const audit=auditInsertSql(db,'institution',actor.email||actor.id,`application.${action}`,{partnerId,applicationId,requestId,version:row.version+1},crypto.randomUUID(),'changed',stamp);
 const statements=[update];if(action==='review_approve'||action==='reject'){const eventType=action==='review_approve'?'loan.approved':'loan.rejected';const outbox=await partnerOutboxInsert(db,{partnerId,eventType,eventId:crypto.randomUUID(),applicationId,occurredAt:stamp,...(action==='reject'?{reason}: {})});statements.push(outbox);}statements.push(audit,db.prepare('INSERT OR IGNORE INTO approval_requests(actor_id,request_id,partner_id,application_id,action,response_status,response_body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(actor.id,requestId,partnerId,applicationId,action,200,JSON.stringify(response),stamp));let batchResult:any[];try{batchResult=await db.batch(statements);}catch(error){if(error instanceof Error&&error.message.toLowerCase().includes('unique'))return json({code:'REQUEST_ID_CONFLICT'},409);throw error;}
 const changed=batchResult[0]?.meta?.changes;if(Number(changed)!==1)return json({code:'VERSION_CONFLICT'},409);return json(response,200);
}
