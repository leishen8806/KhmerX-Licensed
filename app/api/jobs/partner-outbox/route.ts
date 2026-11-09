import {env} from 'cloudflare:workers';
import {dispatchPartnerOutbox} from '@/lib/partner-outbox';

export async function POST(request:Request){
 const expected=String(env.PARTNER_OUTBOX_TASK_KEY||''),provided=request.headers.get('x-job-key')||'';
 const a=new TextEncoder().encode(expected),b=new TextEncoder().encode(provided);let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a[i%Math.max(1,a.length)]||0)^(b[i%Math.max(1,b.length)]||0);if(!expected||diff!==0)return Response.json({error:'Unauthorized',code:'JOB_UNAUTHORIZED'},{status:401});
 try{return Response.json({ok:true,...await dispatchPartnerOutbox(env as Record<string,unknown>)},{status:200});}
 catch{return Response.json({error:'发件箱投递失败，请重试',code:'PARTNER_OUTBOX_FAILED'},{status:503});}
}
