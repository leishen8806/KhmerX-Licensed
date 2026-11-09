CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','lender','checker','finance','finance_checker')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0,1)),
  mfa_secret TEXT,
  mfa_last_counter INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE team_staff_credentials (
  member_id TEXT PRIMARY KEY REFERENCES team_members(id),
  password_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE team_staff_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES team_members(id),
  member_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE team_staff_limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
CREATE TABLE team_mfa_challenges (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES team_members(id),
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER
);
CREATE TABLE team_mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES team_members(id),
  code_hash TEXT NOT NULL,
  used_at INTEGER
);
