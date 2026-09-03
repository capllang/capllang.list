-- Capllang List — Migration 0005
-- P13: Production schema/index reconciliation.
--
-- Tujuan:
-- 1) memastikan index yang terbukti dipakai Worker P12 tersedia;
-- 2) menghapus index legacy/redundan yang tidak dipilih pada query production;
-- 3) tidak mengubah row data dan tidak me-rebuild tabel production.
--
-- Catatan category CHECK:
-- Production records sudah memiliki CHECK (category IN ('rekening','genshin')).
-- Canonical schema.sql P13 mencatat constraint tersebut untuk database BARU.
-- Migration ini sengaja TIDAK rebuild tabel production hanya untuk menambah/mengubah CHECK.

-- Pastikan index yang dipakai jalur aktif tersedia sebelum cleanup.
CREATE INDEX IF NOT EXISTS idx_records_nomor
ON records (nomor);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
ON admin_audit_logs (action);

-- Cleanup index records legacy/redundan.
DROP INDEX IF EXISTS idx_records_category;
DROP INDEX IF EXISTS idx_records_category_date_id;
DROP INDEX IF EXISTS idx_records_category_nomor;
DROP INDEX IF EXISTS idx_records_provenance_status;

-- Cleanup index audit legacy/redundan.
DROP INDEX IF EXISTS idx_admin_audit_action_id;
DROP INDEX IF EXISTS idx_admin_audit_logs_created_at;
