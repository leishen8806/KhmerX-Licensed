CREATE TABLE partner_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  partner_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sending','delivered','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX partner_outbox_due ON partner_outbox(status, next_attempt_at, id);
CREATE INDEX partner_outbox_partner ON partner_outbox(partner_id, created_at);
