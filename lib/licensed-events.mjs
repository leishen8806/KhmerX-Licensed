import {createHash} from 'node:crypto';
import {verifyInstitutionCallback} from './institution-callback.ts';

const TYPES=new Set(['application.submitted','agreement.signed','application.withdrawn','loan.approved','loan.rejected','funding.confirmed','repayment.confirmed','payment.failed']);

export function createLicensedService({secrets={'partner-a':'test-only-secret-1'}}={}){
  const nonces=new Set(), events=new Map(), applications=new Map(), audit=[];
  const reply=(status,body)=>({status,body});
  async function handleEvent({headers={},body,now=Math.floor(Date.now()/1000)}){
    const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v??'')]));
    const partner=h['x-partner-id']||h['x-institution-id'];
    if(h['x-partner-id']&&h['x-institution-id']&&h['x-partner-id']!==h['x-institution-id'])return reply(400,{code:'CALLBACK_HEADERS_INVALID'});
    const idempotency=h['x-idempotency-key']||'';
    if(!partner||idempotency.length<8||idempotency.length>120)return reply(400,{code:'INVALID_HEADERS'});
    const secret=secrets[partner];
    if(!secret||!await verifyInstitutionCallback(secret,{institutionId:partner,timestamp:h['x-timestamp']||'',nonce:h['x-nonce']||'',idempotencyKey:idempotency,body,signature:h['x-signature']||''},now))return reply(401,{code:'SIGNATURE_INVALID'});
    let payload;
    try{payload=JSON.parse(body)}catch{return reply(400,{code:'INVALID_JSON'})}
    if(!TYPES.has(payload.eventType)||typeof payload.applicationId!=='string'||('amountCents' in payload&&(!Number.isInteger(payload.amountCents)||payload.amountCents<=0)))return reply(400,{code:'EVENT_INVALID'});
    const hash=createHash('sha256').update(body).digest('hex'),prior=events.get(idempotency);
    if(prior)return prior.hash===hash?reply(200,{...prior.response,duplicate:true}):reply(409,{code:'IDEMPOTENCY_CONFLICT'});
    if(nonces.has(h['x-nonce']))return reply(409,{code:'NONCE_REPLAY'});
    nonces.add(h['x-nonce']);
    const response={ok:true,accepted:true,applicationId:payload.applicationId};
    events.set(idempotency,{hash,response});
    if(payload.eventType==='application.submitted')applications.set(payload.applicationId,payload);
    audit.push({action:payload.eventType,applicationId:payload.applicationId,at:new Date().toISOString()});
    return reply(202,response);
  }
  return {handleEvent,applications,events,nonces,audit};
}
