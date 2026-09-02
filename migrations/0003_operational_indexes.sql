-- Capllang List — Migration 0003
-- Operational indexes for the current Worker.
-- Aman dijalankan pada production setelah 0002 karena memakai IF NOT EXISTS.

-- Mempercepat pembersihan sesi yang sudah kedaluwarsa saat login admin.
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
ON admin_sessions (expires_at);

-- Mempercepat endpoint audit ketika difilter berdasarkan action.
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_id
ON admin_audit_logs (action, id DESC);
