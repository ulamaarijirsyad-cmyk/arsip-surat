-- ============================================================
-- SI-ARSIP — Phase 2B-1: Initial schema
-- Database: siarsip (PostgreSQL 18)
--
-- Jalankan lewat: npm run db:migrate
-- File ini dijalankan SEKALI per file (dicatat di tabel
-- schema_migrations), namun tetap dibuat idempotent
-- (CREATE ... IF NOT EXISTS) agar aman diulang.
--
-- Catatan penting:
-- * PostgreSQL HANYA menyimpan metadata dokumen.
--   File fisik (PDF/JPG/PNG) disimpan di protected storage
--   dan ditangani pada phase upload/storage berikutnya.
-- * Dokumen mendukung PDF, JPG/JPEG, dan PNG sejak awal.
-- * Soft delete dipakai pada surat_masuk, surat_keluar, documents.
-- ============================================================

-- ------------------------------------------------------------
-- 1. roles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        varchar(50)  NOT NULL,
    description text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_roles_name UNIQUE (name)
);

COMMENT ON TABLE roles IS 'Role pengguna (master data).';

-- ------------------------------------------------------------
-- 2. users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id       bigint      NOT NULL,
    username      varchar(50) NOT NULL,
    -- Hash bcrypt/argon2. PASSWORD PLAINTEXT TIDAK BOLEH DISIMPAN.
    password_hash text        NOT NULL,
    full_name     varchar(150) NOT NULL,
    is_active     boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT fk_users_role_id FOREIGN KEY (role_id)
        REFERENCES roles (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE users IS 'Pengguna sistem. password_hash = hash bcrypt/argon2, bukan password plaintext.';
COMMENT ON COLUMN users.last_login_at IS 'Diisi pada phase authentication (belum diimplementasikan).';

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);

-- ------------------------------------------------------------
-- 3. surat_masuk (soft delete via deleted_at)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS surat_masuk (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nomor_surat       varchar(100) NOT NULL,
    tanggal_surat     date         NOT NULL,
    tanggal_diterima  date         NOT NULL,
    asal_instansi     varchar(200) NOT NULL,
    perihal           text         NOT NULL,
    jenis_surat       varchar(50)  NOT NULL,
    sifat_surat       varchar(50)  NOT NULL,
    penandatangan     varchar(150),
    keterangan        text,
    created_by        bigint       NOT NULL,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT fk_surat_masuk_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT ck_surat_masuk_tanggal CHECK (tanggal_diterima >= tanggal_surat)
);

COMMENT ON TABLE surat_masuk IS 'Surat masuk. Soft delete: baris aktif = deleted_at IS NULL.';
COMMENT ON COLUMN surat_masuk.penandatangan IS 'Boleh NULL (mis. surat belum ditandatangani).';

CREATE INDEX IF NOT EXISTS idx_surat_masuk_created_by ON surat_masuk (created_by);
CREATE INDEX IF NOT EXISTS idx_surat_masuk_nomor_surat ON surat_masuk (nomor_surat);
CREATE INDEX IF NOT EXISTS idx_surat_masuk_deleted_at ON surat_masuk (deleted_at);

-- ------------------------------------------------------------
-- 4. surat_keluar (soft delete via deleted_at)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS surat_keluar (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nomor_surat       varchar(100) NOT NULL,
    tanggal_surat     date         NOT NULL,
    tujuan_instansi   varchar(200) NOT NULL,
    perihal           text         NOT NULL,
    jenis_surat       varchar(50)  NOT NULL,
    sifat_surat       varchar(50)  NOT NULL,
    penandatangan     varchar(150),
    -- Status Tanda Tangan Elektronik. Nilai final ditetapkan pada
    -- phase berikutnya; default 'belum' hanya placeholder awal.
    status_tte        varchar(30)  NOT NULL DEFAULT 'belum',
    keterangan        text,
    created_by        bigint       NOT NULL,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    CONSTRAINT fk_surat_keluar_created_by FOREIGN KEY (created_by)
        REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE surat_keluar IS 'Surat keluar. Soft delete: baris aktif = deleted_at IS NULL.';
COMMENT ON COLUMN surat_keluar.status_tte IS 'Placeholder; vocabulary nilai final menyusul (phase TTE).';

CREATE INDEX IF NOT EXISTS idx_surat_keluar_created_by ON surat_keluar (created_by);
CREATE INDEX IF NOT EXISTS idx_surat_keluar_nomor_surat ON surat_keluar (nomor_surat);
CREATE INDEX IF NOT EXISTS idx_surat_keluar_deleted_at ON surat_keluar (deleted_at);

-- ------------------------------------------------------------
-- 5. documents (metadata saja; file fisik di protected storage)
--    WAJIB mendukung: application/pdf, image/jpeg, image/png.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    surat_masuk_id    bigint,
    surat_keluar_id   bigint,
    original_filename varchar(255) NOT NULL,
    -- Nama file hasil server (UUID), bukan nama asli dari user.
    stored_filename   varchar(255) NOT NULL,
    -- Path relatif di protected storage. BUKAN isi file.
    storage_path      text         NOT NULL,
    mime_type         varchar(100) NOT NULL,
    file_size         bigint       NOT NULL,
    uploaded_by       bigint       NOT NULL,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    deleted_at        timestamptz,
    -- Satu dokumen boleh terkait ke SATU surat saja
    -- (surat_masuk_id ATAU surat_keluar_id, tidak keduanya).
    CONSTRAINT ck_documents_exactly_one_surat CHECK (
        (surat_masuk_id IS NOT NULL)::int + (surat_keluar_id IS NOT NULL)::int = 1
    ),
    -- Dokumen mendukung PDF, JPG/JPEG, dan PNG sejak awal.
    CONSTRAINT ck_documents_mime_type CHECK (
        mime_type IN ('application/pdf', 'image/jpeg', 'image/png')
    ),
    CONSTRAINT ck_documents_file_size CHECK (file_size > 0),
    CONSTRAINT uq_documents_stored_filename UNIQUE (stored_filename),
    CONSTRAINT fk_documents_surat_masuk FOREIGN KEY (surat_masuk_id)
        REFERENCES surat_masuk (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_documents_surat_keluar FOREIGN KEY (surat_keluar_id)
        REFERENCES surat_keluar (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by)
        REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE documents IS
    'Metadata dokumen surat. File fisik TIDAK disimpan di PostgreSQL.';
COMMENT ON COLUMN documents.mime_type IS
    'application/pdf | image/jpeg | image/png';

CREATE INDEX IF NOT EXISTS idx_documents_surat_masuk_id ON documents (surat_masuk_id);
CREATE INDEX IF NOT EXISTS idx_documents_surat_keluar_id ON documents (surat_keluar_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents (uploaded_by);

-- ------------------------------------------------------------
-- 6. disposisi
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disposisi (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    surat_masuk_id bigint       NOT NULL,
    from_user_id   bigint       NOT NULL,
    to_user_id     bigint       NOT NULL,
    instruksi      text         NOT NULL,
    status         varchar(30)  NOT NULL DEFAULT 'menunggu',
    created_at     timestamptz  NOT NULL DEFAULT now(),
    completed_at   timestamptz,
    CONSTRAINT fk_disposisi_surat_masuk FOREIGN KEY (surat_masuk_id)
        REFERENCES surat_masuk (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_disposisi_from_user FOREIGN KEY (from_user_id)
        REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_disposisi_to_user FOREIGN KEY (to_user_id)
        REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE disposisi IS 'Disposisi surat masuk dari satu pengguna ke pengguna lain.';
COMMENT ON COLUMN disposisi.status IS 'Placeholder; vocabulary nilai final menyusul.';

CREATE INDEX IF NOT EXISTS idx_disposisi_surat_masuk_id ON disposisi (surat_masuk_id);
CREATE INDEX IF NOT EXISTS idx_disposisi_from_user_id ON disposisi (from_user_id);
CREATE INDEX IF NOT EXISTS idx_disposisi_to_user_id ON disposisi (to_user_id);

-- ------------------------------------------------------------
-- 7. audit_logs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Boleh NULL untuk aksi sistem yang tidak terkait pengguna
    -- (mis. gagal login sebelum user dikenali).
    user_id     bigint,
    action      varchar(50)  NOT NULL,
    entity_type varchar(50),
    entity_id   bigint,
    description text,
    ip_address  inet,
    user_agent  text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE audit_logs IS 'Jejak audit aktivitas. user_id NULL = aksi sistem.';

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

-- ------------------------------------------------------------
-- Trigger: updated_at selalu diperbarui otomatis saat UPDATE.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_surat_masuk_set_updated_at ON surat_masuk;
CREATE TRIGGER trg_surat_masuk_set_updated_at
    BEFORE UPDATE ON surat_masuk
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_surat_keluar_set_updated_at ON surat_keluar;
CREATE TRIGGER trg_surat_keluar_set_updated_at
    BEFORE UPDATE ON surat_keluar
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
