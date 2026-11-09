import {env} from 'cloudflare:workers';
import {route} from '@/lib/http/route';
import {staffIdentity} from '@/lib/team/auth';
import {applyDecision,applicationDetail,listApplications} from '@/lib/approval';
import type {Actor} from '@/lib/approval';

const database=()=> (env as unknown as {DB:unknown}).DB;
export const GET=route({origin:'required',handler:async request=>{const actor=await staffIdentity(database() as never,request.headers.get('cookie'));if(actor.role==='admin')return Response.json({code:'ROLE_FORBIDDEN'},{status:403});const url=new URL(request.url),partnerId=url.searchParams.get('partnerId')||'',id=url.searchParams.get('id');if(!partnerId)return Response.json({code:'INVALID_REQUEST'},{status:400});if(id)return Response.json({ok:true,application:await applicationDetail(database() as never,partnerId,id)});return Response.json({ok:true,applications:await listApplications(database() as never,partnerId,url.searchParams.get('status'),Number(url.searchParams.get('limit')||50))});}});
export const POST=route({origin:'required',handler:async request=>{const actor=await staffIdentity(database() as never,request.headers.get('cookie'));const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return Response.json({code:'INVALID_REQUEST'},{status:400});return applyDecision(database() as never,actor as unknown as Actor,body as Record<string,unknown>);}});
