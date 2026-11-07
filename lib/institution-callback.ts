// Copied from KhmerX cd66a5b lib/institution-callback.ts.
const encoder=new TextEncoder();

function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')}
function canonical(input:{institutionId:string;timestamp:string;nonce:string;body:string;idempotencyKey?:string}){return [input.institutionId,input.timestamp,input.nonce,input.idempotencyKey||'',input.body].join('\n')}

export async function signInstitutionCallback(secret:string,input:{institutionId:string;timestamp:string;nonce:string;body:string;idempotencyKey?:string}){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(canonical(input))));
}

export async function verifyInstitutionCallback(secret:string,input:{institutionId:string;timestamp:string;nonce:string;body:string;signature:string;idempotencyKey?:string},now=Math.floor(Date.now()/1000),skew=300){
 const timestamp=Number(input.timestamp);
 if(!/^[0-9]{10}$/.test(input.timestamp)||!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>skew)return false;
 if(!/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce)||!/^[a-f0-9]{64}$/i.test(input.signature))return false;
 const expected=await signInstitutionCallback(secret,input),a=encoder.encode(expected.toLowerCase()),b=encoder.encode(input.signature.toLowerCase());
 if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
