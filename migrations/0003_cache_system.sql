-- 数据缓存系统表结构
-- 创建于: 2026-04-10

-- 缓存数据表
CREATE TABLE data_cache (
  cache_key TEXT PRIMARY KEY,
  cache_data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 缓存过期时间索引，用于快速清理过期数据
CREATE INDEX idx_data_cache_expires ON data_cache(expires_at);

-- 缓存更新日志表
CREATE TABLE cache_update_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_msg TEXT,
  created_at INTEGER NOT NULL
);

-- 按缓存键和时间查询索引
CREATE INDEX idx_cache_log_key ON cache_update_log(cache_key, created_at DESC);

-- 按时间查询索引
CREATE INDEX idx_cache_log_time ON cache_update_log(created_at DESC);
