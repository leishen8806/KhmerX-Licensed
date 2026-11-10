CREATE TABLE applications_v5 (
  partner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','pending_check','approved','rejected','signed','withdrawn','funding_pending_check','funded','repaying','repayment_pending_check','closed')),
  payload TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'none' CHECK (decision IN ('none','approved','rejected')),
  approved_by TEXT, checked_by TEXT, reject_reason TEXT, decided_at TEXT, checked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  funding_amount_cents INTEGER, funding_external_reference TEXT, funding_requested_by TEXT, funding_checked_by TEXT,
  funding_requested_at TEXT, funding_checked_at TEXT, repaid_amount_cents INTEGER NOT NULL DEFAULT 0,
  repayment_amount_cents INTEGER, repayment_external_reference TEXT, repayment_requested_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (partner_id,id)
);
INSERT INTO applications_v5 (partner_id,id,status,payload,decision,approved_by,checked_by,reject_reason,decided_at,checked_at,version,created_at,updated_at)
 SELECT partner_id,id,status,payload,decision,approved_by,checked_by,reject_reason,decided_at,checked_at,version,created_at,updated_at FROM applications;
DROP TABLE applications;
ALTER TABLE applications_v5 RENAME TO applications;
CREATE INDEX applications_status ON applications(status,updated_at,id);
CREATE TABLE funding_limits (id INTEGER PRIMARY KEY CHECK (id=1), limit_cents INTEGER NOT NULL, used_cents INTEGER NOT NULL DEFAULT 0);
CREATE TABLE funding_requests (
  actor_id TEXT NOT NULL, request_id TEXT NOT NULL, partner_id TEXT NOT NULL, application_id TEXT NOT NULL,
  action TEXT NOT NULL, response_status INTEGER NOT NULL, response_body TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (actor_id,request_id)
);
CREATE TABLE funding_payments (
  partner_id TEXT NOT NULL, application_id TEXT NOT NULL, kind TEXT NOT NULL, external_reference TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL, checked_by TEXT,
  created_at TEXT NOT NULL, PRIMARY KEY (partner_id,kind,external_reference)
);
CREATE TABLE batch_guard (ok INTEGER NOT NULL CHECK (ok=1));
