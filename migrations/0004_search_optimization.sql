-- Capllang List — Migration 0004
-- P4: Search & public pagination optimization.
-- Jalankan setelah 0003 dan sebelum deploy Worker P4.

-- Index publik yang lebih kecil karena hanya memuat record aktif.
-- Dipakai untuk daftar kategori, cursor pagination, dan pencarian tanggal.
CREATE INDEX IF NOT EXISTS idx_records_public_category_date_id
ON records (category, tanggal DESC, id DESC)
WHERE deleted_at IS NULL;

-- Index publik khusus nomor/UID aktif untuk exact/prefix search.
CREATE INDEX IF NOT EXISTS idx_records_public_category_nomor
ON records (category, nomor)
WHERE deleted_at IS NULL;

-- Index P2 lama mencakup record aktif + terhapus dan menjadi redundant untuk
-- endpoint publik setelah partial index di atas tersedia.
DROP INDEX IF EXISTS idx_records_active_category_date_id;
