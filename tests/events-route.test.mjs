import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createLicensedService} from '../lib/licensed-events.mjs';

const root=new URL('./fixtures/arc04-v0/events/',import.meta.url);
const secret='test-only-secret-1';
const headers=(body,nonce='nonce-route-000001',key='idem-route-001')=>{const timestamp='1794000000';const partner='partner-a';return {'x-partner-id':partner,'x-timestamp':timestamp,'x-nonce':nonce,'x-idempotency-key':key,'x-signature':createHmac('sha256',secret).update([partner,timestamp,nonce,key,body].join('\n')).digest('hex')}};

test('licensed receiver accepts valid event samples and rejects invalid samples',async()=>{
  const service=createLicensedService();
  for(const name of ['application.submitted','agreement.signed','application.withdrawn','loan.approved','loan.rejected','funding.confirmed','repayment.confirmed','payment.failed']){
    const body=await readFile(new URL(`${name}.json`,root),'utf8');
    const safe=name.replaceAll('.','-');
    assert.equal((await service.handleEvent({headers:headers(body,`nonce-${safe}-000001`,`idem-${safe}-001`),body,now:1794000000})).status,202,name);
  }
  for(const name of ['invalid-missing-application-id','invalid-negative-amount','invalid-unknown-event']){
    const body=await readFile(new URL(`${name}.json`,root),'utf8');
    const safe=name.replaceAll('.','-');
    assert.equal((await service.handleEvent({headers:headers(body,`nonce-${safe}-000001`,`idem-${safe}-001`),body,now:1794000000})).status,400,name);
  }
});

test('licensed receiver is idempotent and rejects replay and mismatched headers',async()=>{
  const service=createLicensedService();const body=JSON.stringify({eventType:'application.submitted',applicationId:'app-synthetic-001'});
  assert.equal((await service.handleEvent({headers:headers(body),body,now:1794000000})).status,202);
  assert.equal((await service.handleEvent({headers:headers(body,'nonce-route-000002'),body,now:1794000000})).body.duplicate,true);
  assert.equal((await service.handleEvent({headers:{...headers(body,'nonce-route-000003'),'x-institution-id':'other'},body,now:1794000000})).status,400);
  assert.equal((await service.handleEvent({headers:headers(body,'nonce-route-000001','idem-route-002'),body,now:1794000000})).status,409);
});
