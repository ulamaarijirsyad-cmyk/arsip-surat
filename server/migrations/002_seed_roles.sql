-- ============================================================
-- SI-ARSIP — Phase 2B-2: Seed data roles
-- Database: siarsip (PostgreSQL 18)
--
-- Jalankan lewat: npm run db:migrate
-- Dicatat di schema_migrations sebagai 002_seed_roles.sql,
-- sehingga pada run berikutnya DILEWATI oleh migration runner.
--
-- ON CONFLICT (name) DO NOTHING dipakai sebagai lapis pengaman
-- kedua: bila role sudah ada (mis. dijalankan manual), TIDAK ada
-- duplikat dan TIDAK ada baris yang diubah/dihapus.
--
-- PENTING: gunakan `name` sebagai unique key, JANGAN mengandalkan
-- id tertentu (1, 2, 3) untuk relasi.
-- ============================================================

INSERT INTO roles (name, description)
VALUES
    ('admin',    'Administrator sistem'),
    ('petugas',  'Petugas pengelola arsip surat'),
    ('pimpinan', 'Pimpinan/pengguna yang membutuhkan akses arsip dan disposisi')
ON CONFLICT (name) DO NOTHING;
