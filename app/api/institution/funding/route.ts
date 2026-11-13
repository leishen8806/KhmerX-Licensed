import {env} from 'cloudflare:workers';
import {route} from '@/lib/http/route';
import {staffIdentity} from '@/lib/team/auth';
import {fundingDecision,fundingLimitUpdate} from '@/lib/funding';
const db=()=> (env as unknown as {DB:unknown}).DB;
export const POST=route({origin:'required',handler:async request=>{const actor=await staffIdentity(db() as never,request.headers.get('cookie'));const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return Response.json({code:'INVALID_REQUEST'},{status:400});const input=body as Record<string,unknown>;return input.action==='set_limit'?fundingLimitUpdate(db() as never,actor as never,input):fundingDecision(db() as never,actor as never,input);}});
