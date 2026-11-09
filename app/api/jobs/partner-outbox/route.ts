import {env} from 'cloudflare:workers';
import {dispatchPartnerOutbox} from '@/lib/partner-outbox';

export async function POST(request:Request){
 const expected=String(env.PARTNER_OUTBOX_TASK_KEY||''),provided=request.headers.get('x-job-key')||'';
 if(!expected||provided!==expected)return Response.json({error:'Unauthorized',code:'JOB_UNAUTHORIZED'},{status:401});
 try{return Response.json({ok:true,...await dispatchPartnerOutbox(env as Record<string,unknown>)},{status:200});}
 catch{return Response.json({error:'发件箱投递失败，请重试',code:'PARTNER_OUTBOX_FAILED'},{status:503});}
}
