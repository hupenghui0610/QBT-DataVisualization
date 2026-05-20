-- Feishu OAuth login fields. Existing password users keep password login enabled.
ALTER TABLE users ADD COLUMN feishu_open_id TEXT;
ALTER TABLE users ADD COLUMN feishu_union_id TEXT;
ALTER TABLE users ADD COLUMN feishu_user_id TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN password_login_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_provider TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE UNIQUE INDEX idx_users_feishu_open_id
  ON users(feishu_open_id)
  WHERE feishu_open_id IS NOT NULL AND feishu_open_id <> '';

CREATE UNIQUE INDEX idx_users_feishu_union_id
  ON users(feishu_union_id)
  WHERE feishu_union_id IS NOT NULL AND feishu_union_id <> '';

CREATE UNIQUE INDEX idx_users_feishu_user_id
  ON users(feishu_user_id)
  WHERE feishu_user_id IS NOT NULL AND feishu_user_id <> '';
