-- Capllang List — Migration 0001
-- Baseline schema sebelum P2 soft-delete/audit snapshot.
-- Untuk database BARU/KOSONG saja.

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
  created_at INTEGER NOT NULL
);
