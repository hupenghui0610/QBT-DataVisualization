CREATE TABLE login_security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  phone TEXT,
  user_id INTEGER,
  client_ip TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_login_security_events_scope_time
  ON login_security_events(scope_type, scope_key, created_at DESC);

CREATE INDEX idx_login_security_events_event_time
  ON login_security_events(event_type, created_at DESC);

CREATE TABLE login_security_blocks (
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  blocked_until TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (scope_type, scope_key)
);

CREATE INDEX idx_login_security_blocks_until
  ON login_security_blocks(blocked_until);
