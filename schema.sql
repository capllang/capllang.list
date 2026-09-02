-- Capllang List — Canonical D1 Schema
-- Current schema: P3 / after migrations 0001 + 0002 + 0003.
-- Gunakan file ini untuk membuat database D1 BARU/KOSONG dari nol.
-- Untuk production yang sudah berjalan, gunakan migration berikutnya saja.

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  nomor TEXT NOT NULL,
  tanggal TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '-',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_type TEXT NOT NULL DEFAULT 'legacy_archive',
  source_ref TEXT NOT NULL DEFAULT '-',
  verification_status TEXT NOT NULL DEFAULT 'report_recorded',
  provenance_updated_at INTEGER DEFAULT NULL,
  deleted_at INTEGER DEFAULT NULL,
  UNIQUE (category, nomor)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  session_nonce TEXT DEFAULT NULL,
  target_record_id INTEGER DEFAULT NULL,
  category TEXT DEFAULT NULL,
  request_id TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL,
  before_snapshot TEXT DEFAULT NULL,
  after_snapshot TEXT DEFAULT NULL
);

-- P2 indexes
CREATE INDEX IF NOT EXISTS idx_records_active_category_date_id
ON records (deleted_at, category, tanggal DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_records_soft_deleted_lookup
ON records (category, nomor, deleted_at);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target_id
ON admin_audit_logs (target_record_id, id DESC);

-- P3 operational indexes
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
ON admin_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action_id
ON admin_audit_logs (action, id DESC);
