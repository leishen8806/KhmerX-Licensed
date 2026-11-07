import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { signInstitutionCallback, verifyInstitutionCallback } from '../lib/institution-callback.ts';

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

