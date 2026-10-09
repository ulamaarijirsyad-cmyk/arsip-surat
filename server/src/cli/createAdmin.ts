import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  hashPassword,
} from '../auth/password';
import { DatabaseNotConfiguredError, closePool, getPool } from '../db/pool';
import { createCliPrompter } from './prompt';

/**
 * PHASE 2C-2 — Bootstrap admin pertama (CLI lokal).
 *
 * Jalankan: npm run user:create-admin
 *
 * Prinsip:
 * - BUKAN endpoint HTTP, BUKAN dijalankan saat server start.
 * - Password hanya diminta interaktif (input hidden), tidak pernah
 *   ditulis ke source code, log, maupun output CLI.
 * - Hash bcrypt memakai utility Phase 2C-1 (hashPassword) — tanpa
 *   implementasi hashing kedua.
 * - Role diambil dari tabel roles berdasarkan NAME ('admin'),
 *   TIDAK hardcode ID.
 * - Proses INSERT dibungkus transaksi (BEGIN/COMMIT/ROLLBACK).
 * - Semua query memakai parameterized query.
 */

/** Error dengan pesan yang AMAN ditampilkan ke pengguna CLI. */
class CliError extends Error {}

/** Format username yang aman & sederhana (sesuai kolom varchar(50)). */
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

/** Nama role dicari dari database — jangan pernah hardcode ID. */
const ADMIN_ROLE_NAME = 'admin';

const MAX_FULL_NAME_LENGTH = 150;

function fail(message: string): never {
  throw new CliError(message);
}

/** Ringkasan error yang aman ditampilkan (hanya kode & tipe). */
function safeErrorSummary(err: unknown): string {
  const code = (err as { code?: unknown } | undefined)?.code;
  const name = err instanceof Error ? err.name : 'UnknownError';
  return `kode: ${typeof code === 'string' ? code : 'unknown'}, tipe: ${name}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | undefined)?.code === '23505';
}

async function main(): Promise<void> {
  const prompter = createCliPrompter();

  try {
    console.log('=== SI-ARSIP — Buat Admin ===');
    console.log('Password hanya diproses sebagai hash bcrypt dan tidak ditampilkan.\n');

    // ---- 1. Username ----
    const username = (await prompter.ask('Username: ')).trim();
    if (!USERNAME_PATTERN.test(username)) {
      fail(
        'Username tidak valid. Gunakan 3-50 karakter terdiri dari huruf (a-z/A-Z), angka, titik, underscore, atau dash.',
      );
    }

    // ---- 2. Nama lengkap ----
    const fullName = (await prompter.ask('Nama lengkap: ')).trim();
    if (fullName.length === 0 || fullName.length > MAX_FULL_NAME_LENGTH) {
      fail(`Nama lengkap wajib diisi (maksimal ${MAX_FULL_NAME_LENGTH} karakter).`);
    }

    // ---- 3. Password (hidden) ----
    const password = await prompter.ask('Password: ', { hidden: true });
    if (password.length === 0) {
      fail('Password tidak boleh kosong.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      fail(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      fail(`Password maksimal ${MAX_PASSWORD_BYTES} byte (batas bcrypt).`);
    }

    // ---- 4. Konfirmasi password (hidden) ----
    const confirmation = await prompter.ask('Konfirmasi password: ', { hidden: true });
    if (confirmation !== password) {
      fail('Konfirmasi password tidak sama dengan password.');
    }

    // Hash SEBELUM transaksi: bcrypt CPU-bound, jangan menahan koneksi transaksi.
    // (memakai utility Phase 2C-1; plaintext tidak pernah dicetak/di-log)
    const passwordHash = await hashPassword(password);

    // ---- 5. Transaksi: lookup role → cek duplikat → INSERT → COMMIT ----
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      const roleResult = await client.query<{ id: string }>(
        'SELECT id FROM roles WHERE name = $1',
        [ADMIN_ROLE_NAME],
      );
      const roleRow = roleResult.rows[0];
      if (!roleRow) {
        fail(
          `Role "${ADMIN_ROLE_NAME}" tidak ditemukan di tabel roles. Proses dibatalkan, tidak ada user dibuat.`,
        );
      }

      const duplicate = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
      if (duplicate.rows.length > 0) {
        fail('Username sudah digunakan. Tidak ada user baru yang dibuat.');
      }

      // created_at/updated_at memakai default database; last_login_at tetap NULL.
      await client.query(
        'INSERT INTO users (role_id, username, password_hash, full_name, is_active) VALUES ($1, $2, $3, $4, TRUE)',
        [Number(roleRow.id), username, passwordHash, fullName],
      );

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Koneksi bermasalah — biarkan; error asli yang dilaporkan di bawah.
      }

      if (err instanceof CliError) throw err;
      if (isUniqueViolation(err)) {
        fail('Username sudah digunakan. Tidak ada user baru yang dibuat.');
      }
      if (err instanceof DatabaseNotConfiguredError) {
        fail('DATABASE_URL belum dikonfigurasi di file .env.');
      }
      throw new CliError(
        `Gagal membuat admin (${safeErrorSummary(err)}). Tidak ada perubahan yang tersimpan.`,
      );
    } finally {
      client.release(); // koneksi SELALU dikembalikan ke pool
    }

    console.log(`\nAdmin berhasil dibuat: username="${username}", role="${ADMIN_ROLE_NAME}".`);
    console.log('Password disimpan sebagai hash bcrypt (plaintext tidak disimpan).');
    console.log('Login tersedia di POST /api/auth/login.');
  } finally {
    prompter.close();
  }
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (err: unknown) => {
    if (err instanceof CliError) {
      console.error(`[gagal] ${err.message}`);
    } else if (err instanceof DatabaseNotConfiguredError) {
      console.error('[gagal] DATABASE_URL belum dikonfigurasi di file .env.');
    } else {
      // Jangan tampilkan pesan error mentah (bisa memuat detail koneksi).
      console.error(`[gagal] Terjadi kesalahan (${safeErrorSummary(err)}).`);
    }
    try {
      await closePool();
    } catch {
      // Abaikan: pool mungkin belum terbentuk.
    }
    process.exitCode = 1;
  });
