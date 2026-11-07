CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','signed','withdrawn')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE inbound_events (
  idempotency_key TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE team_audit (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  tenant_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
