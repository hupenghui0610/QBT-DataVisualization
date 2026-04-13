CREATE TABLE IF NOT EXISTS data_cache (
  cache_key TEXT PRIMARY KEY,
  cache_data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_cache_expires ON data_cache(expires_at);

CREATE TABLE IF NOT EXISTS cache_update_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_msg TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_log_key ON cache_update_log(cache_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_log_time ON cache_update_log(created_at DESC);
