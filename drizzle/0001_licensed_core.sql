CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE inbound_events (
  idempotency_key TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
