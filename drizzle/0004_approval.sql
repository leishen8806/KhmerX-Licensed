CREATE TABLE applications_v4 (
  partner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','pending_check','approved','rejected','signed','withdrawn')),
  payload TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'none' CHECK (decision IN ('none','approved','rejected')),
  approved_by TEXT,
  checked_by TEXT,
  reject_reason TEXT,
  decided_at TEXT,
  checked_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (partner_id,id)
);
INSERT INTO applications_v4 (partner_id,id,status,payload,created_at,updated_at)
 SELECT partner_id,id,status,payload,created_at,updated_at FROM applications;
DROP TABLE applications;
ALTER TABLE applications_v4 RENAME TO applications;
CREATE INDEX applications_status ON applications(status,updated_at,id);
CREATE TABLE approval_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  partner_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  action TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
