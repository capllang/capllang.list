-- P2: Soft delete + audit snapshots
-- Jalankan SATU KALI pada D1 sebelum deploy Worker_P2.mjs.

ALTER TABLE records ADD COLUMN deleted_at INTEGER DEFAULT NULL;

ALTER TABLE admin_audit_logs ADD COLUMN before_snapshot TEXT DEFAULT NULL;
ALTER TABLE admin_audit_logs ADD COLUMN after_snapshot TEXT DEFAULT NULL;

-- Membantu query daftar publik yang selalu memfilter deleted_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_records_active_category_date_id
ON records (deleted_at, category, tanggal DESC, id DESC);

-- Membantu deteksi record yang pernah dihapus ketika nomor/UID ditambahkan kembali.
CREATE INDEX IF NOT EXISTS idx_records_soft_deleted_lookup
ON records (category, nomor, deleted_at);

-- Membantu penelusuran histori perubahan per record.
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_id
ON admin_audit_logs (target_record_id, id DESC);
