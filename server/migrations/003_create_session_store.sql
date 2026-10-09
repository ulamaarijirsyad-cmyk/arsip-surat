-- ============================================================
-- SI-ARSIP — Phase 2C-1: Tabel session store (server-side session)
-- Database: siarsip (PostgreSQL 18)
--
-- Dipakai oleh express-session melalui connect-pg-simple.
-- Jalankan lewat: npm run db:migrate
--
-- Catatan:
-- * Tabel ini dibuat LEWAT migration (bukan oleh connect-pg-simple):
--   opsi createTableIfMissing = false pada kode session.
-- * Kolom sess hanya berisi isi session (mis. userId + metadata
--   cookie). TIDAK PERNAH berisi password maupun password_hash.
-- * Tipe expire memakai timestamptz agar perbandingan dengan
--   to_timestamp() tidak bergantung pada TimeZone sesi database.
-- ============================================================

CREATE TABLE IF NOT EXISTS session (
    sid    varchar     PRIMARY KEY,
    sess   json        NOT NULL,
    expire timestamptz NOT NULL
);

COMMENT ON TABLE session IS
    'Session server-side (express-session + connect-pg-simple). Data sensitif (password) TIDAK disimpan di sini.';

-- Dipakai oleh proses prune session kadaluarsa (DELETE WHERE expire < ...).
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
