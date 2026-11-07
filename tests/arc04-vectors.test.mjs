import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { signInstitutionCallback, verifyInstitutionCallback } from '../lib/institution-callback.ts';
import { createMockInstitutionServer } from '../scripts/mock-institution/server.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(root, 'fixtures', 'arc04-v0');

test('ARC-04 signing vectors match the shared implementation', async () => {
  const vectors = JSON.parse(await readFile(join(fixtureRoot, 'signing.json'), 'utf8')).vectors;
  assert.ok(vectors.length >= 8);
  for (const vector of vectors) {
    assert.equal(
      [vector.partnerId, vector.timestamp, vector.nonce, vector.idempotencyKey, vector.body].join('\n'),
      vector.canonical,
      vector.name,
    );
    const input = {
      institutionId: vector.partnerId,
      timestamp: vector.timestamp,
      nonce: vector.nonce,
      idempotencyKey: vector.idempotencyKey,
      body: vector.body,
    };
    const generated = await signInstitutionCallback(vector.secret, input);
    assert.equal(generated.toLowerCase(), vector.signature.toLowerCase(), vector.name);
    assert.equal(
      await verifyInstitutionCallback(vector.secret, { ...input, signature: vector.signature }, vector.now),
      vector.valid,
      vector.name,
    );
  }
});

test('ARC-04 event fixtures contain eight valid and three invalid samples', async () => {
  const validTypes = new Set([
    'application.submitted',
    'agreement.signed',
    'application.withdrawn',
    'loan.approved',
    'loan.rejected',
    'funding.confirmed',
    'repayment.confirmed',
    'payment.failed',
  ]);
  const validNames = [...validTypes].map(name => `${name}.json`);
  for (const name of validNames) {
    const event = JSON.parse(await readFile(join(fixtureRoot, 'events', name), 'utf8'));
    assert.ok(validTypes.has(event.eventType));
    assert.equal(typeof event.applicationId, 'string');
    if ('amountCents' in event) assert.equal(Number.isInteger(event.amountCents) && event.amountCents > 0, true);
  }
  const missingId = JSON.parse(await readFile(join(fixtureRoot, 'events', 'invalid-missing-application-id.json'), 'utf8'));
  const negative = JSON.parse(await readFile(join(fixtureRoot, 'events', 'invalid-negative-amount.json'), 'utf8'));
  const unknown = JSON.parse(await readFile(join(fixtureRoot, 'events', 'invalid-unknown-event.json'), 'utf8'));
  assert.equal(typeof missingId.applicationId, 'undefined');
  assert.equal(negative.amountCents < 0, true);
  assert.equal(validTypes.has(unknown.eventType), false);
});

test('local mock institution verifies, deduplicates and rejects replayed requests', async t => {
  const { server, listen } = createMockInstitutionServer({ port: 0, secret: 'test-only-secret-1' });
  await listen();
  t.after(() => server.close());
  const { port } = server.address();
  const body = JSON.stringify({ eventType: 'loan.approved', applicationId: 'app-mock-001' });
  const partnerId = 'partner-a';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const idempotencyKey = 'idem-mock-001';
  const make = (nonce, payload = body, signatureBody = payload) => ({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-partner-id': partnerId,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-idempotency-key': idempotencyKey,
      'x-signature': createHmac('sha256', 'test-only-secret-1')
        .update([partnerId, timestamp, nonce, idempotencyKey, signatureBody].join('\n'))
        .digest('hex'),
    },
    body: payload,
  });
  const endpoint = `http://127.0.0.1:${port}/v0/events`;
  const first = await fetch(endpoint, make('nonce-mock-000001'));
  assert.equal(first.status, 202);
  const duplicate = await fetch(endpoint, make('nonce-mock-000002'));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  const conflict = await fetch(endpoint, make('nonce-mock-000003', JSON.stringify({ eventType: 'loan.rejected', applicationId: 'app-mock-001' })));
  assert.equal(conflict.status, 409);
  const replay = await fetch(endpoint, make('nonce-mock-000001'));
  assert.equal(replay.status, 409);
  const bad = await fetch(endpoint, { ...make('nonce-mock-000004'), headers: { ...make('nonce-mock-000004').headers, 'x-signature': '0'.repeat(64) } });
  assert.equal(bad.status, 401);
  const shortKey = await fetch(endpoint, {
    ...make('nonce-mock-000005'),
    headers: { ...make('nonce-mock-000005').headers, 'x-idempotency-key': 'short' },
  });
  assert.equal(shortKey.status, 400);
});
