import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath, URL } from 'node:url';

const DEFAULT_SECRET = 'test-only-secret-1';
const MAX_BODY_BYTES = 1024 * 1024;

function canonical({ partnerId, timestamp, nonce, idempotencyKey, body }) {
  return [partnerId, timestamp, nonce, idempotencyKey || '', body].join('\n');
}

function signature(secret, input) {
  return createHmac('sha256', secret).update(canonical(input)).digest('hex');
}

function validSignature(secret, input, now = Math.floor(Date.now() / 1000)) {
  if (!/^[0-9]{10}$/.test(input.timestamp)) return false;
  if (Math.abs(now - Number(input.timestamp)) > 300) return false;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce)) return false;
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;
  const expected = Buffer.from(signature(secret, input), 'hex');
  const received = Buffer.from(input.signature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function json(res, status, value, extra = {}) {
  const raw = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json', ...extra });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createMockInstitutionServer({
  host = '127.0.0.1',
  port = Number(process.env.MOCK_INSTITUTION_PORT || 8799),
  secret = process.env.MOCK_INSTITUTION_SECRET || DEFAULT_SECRET,
  delayMs = Number(process.env.MOCK_DELAY_MS || 0),
  failRatio = Number(process.env.MOCK_FAIL_RATIO || 0),
  timeout = process.env.MOCK_TIMEOUT === '1',
  duplicateResponse = process.env.MOCK_DUPLICATE_RESPONSE === '1',
} = {}) {
  if (host !== '127.0.0.1') throw new Error('mock institution host must be 127.0.0.1');
  const nonces = new Set();
  const idempotency = new Map();
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v0/events') {
      json(res, 404, { error: 'not_found' });
      return;
    }
    let body;
    try {
      body = await readBody(req);
      JSON.parse(body);
    } catch {
      json(res, 400, { error: 'invalid_json' });
      return;
    }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v ?? '']));
    const input = {
      partnerId: String(headers['x-partner-id'] || ''),
      timestamp: String(headers['x-timestamp'] || ''),
      nonce: String(headers['x-nonce'] || ''),
      idempotencyKey: String(headers['x-idempotency-key'] || ''),
      signature: String(headers['x-signature'] || ''),
      body,
    };
    if (!input.partnerId || !/^[A-Za-z0-9._:-]{3,80}$/.test(input.partnerId) || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 120) {
      json(res, 400, { error: 'headers_invalid' });
      return;
    }
    if (!validSignature(secret, input)) {
      json(res, 401, { error: 'signature_invalid' });
      return;
    }
    if (nonces.has(input.nonce)) {
      json(res, 409, { error: 'nonce_replay' });
      return;
    }
    const bodyHash = createHmac('sha256', 'test-only-body-hash').update(body).digest('hex');
    const prior = idempotency.get(input.idempotencyKey);
    if (prior) {
      if (prior.bodyHash !== bodyHash) json(res, 409, { error: 'idempotency_conflict' });
      else json(res, 200, { ...prior.response, duplicate: true });
      return;
    }
    nonces.add(input.nonce);
    if (timeout) return;
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (failRatio > 0 && Math.random() < failRatio) {
      json(res, 500, { error: 'synthetic_failure' });
      return;
    }
    const response = { ok: true, accepted: true, partnerId: input.partnerId, idempotencyKey: input.idempotencyKey };
    idempotency.set(input.idempotencyKey, { bodyHash, response });
    json(res, 202, duplicateResponse ? { ...response, duplicate: true } : response, duplicateResponse ? { 'x-mock-duplicate': 'true' } : {});
  });
  const listen = (listenPort = port) => new Promise(resolve => {
    server.listen(listenPort, host, () => resolve(server.address()));
  });
  return { server, listen, nonces, idempotency };
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (!args[i].startsWith('--')) continue;
    const key = args[i].slice(2).replaceAll('-', '_');
    out[key] = args[i + 1]?.startsWith('--') ? true : (args[i + 1] ?? true);
    if (out[key] !== true) i += 1;
  }
  return out;
}

async function sendCallback(args) {
  const target = new URL(args.target || 'http://127.0.0.1:8788/api/institution/callback');
  if (target.hostname !== '127.0.0.1') throw new Error('mock callback target must be 127.0.0.1');
  const eventType = args.event || 'loan.approved';
  const applicationId = args.application_id || 'app-001';
  const eventId = args.event_id || `event-${randomBytes(8).toString('hex')}`;
  const body = JSON.stringify({
    eventId,
    eventType,
    applicationId,
    loanId: applicationId,
    externalReference: args.external_reference || `synthetic-${eventType}`,
    amountCents: Number(args.amount_cents || 1000),
    paymentType: args.payment_type || 'repayment',
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(12).toString('base64url');
  const idempotencyKey = args.idempotency_key || randomBytes(12).toString('base64url');
  const partnerId = args.partner_id || 'partner-a';
  const secret = args.secret || DEFAULT_SECRET;
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-partner-id': partnerId,
      'x-institution-id': partnerId,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-idempotency-key': idempotencyKey,
      'x-signature': signature(secret, { partnerId, timestamp, nonce, idempotencyKey, body }),
    },
    body,
  });
  console.log(`callback status=${response.status}`);
  console.log((await response.text()).slice(0, 1000));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args._?.[0] === 'callback' || process.argv[2] === 'callback') {
    await sendCallback(parseArgs(process.argv.slice(3)));
  } else {
    const { listen, server } = createMockInstitutionServer({ port: Number(args.port || process.env.MOCK_INSTITUTION_PORT || 8799) });
    await listen();
    const address = server.address();
    console.log(`mock institution listening on http://127.0.0.1:${address.port}`);
  }
}
