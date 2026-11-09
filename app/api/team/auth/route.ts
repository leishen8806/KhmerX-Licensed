import {env} from 'cloudflare:workers';
import {route} from '@/lib/http/route';
import {AuthError} from '@/lib/http/errors';
import {logoutStaff,sessionCookie,staffLogin} from '@/lib/team/auth';

const database=()=> (env as unknown as {DB:Parameters<typeof staffLogin>[0]}).DB;
export const POST=route({origin:'required',handler:async request=>{const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')throw new AuthError('请求格式无效',400,undefined,'INVALID_REQUEST');const proxyIp=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';const result=await staffLogin(database(),body as Record<string,unknown>,proxyIp,String((env as Record<string,unknown>).PAYEASE_AUTH_SECRET||''));if('token' in result)return Response.json({ok:true,role:result.role},{headers:{'Set-Cookie':sessionCookie(result.token)}});return Response.json({ok:false,mfaRequired:true,challenge:result.challenge});}});
export const DELETE=route({origin:'required',handler:async request=>{await logoutStaff(database(),request.headers.get('cookie'));return Response.json({ok:true});}});
