/**
 * Migration runner sederhana untuk SI-ARSIP (Phase 2B-1).
 *
 * Dipakai: npm run db:migrate
 *
 * Cara kerja:
 * 1. Membaca semua file *.sql di server/migrations (urut nama file).
 * 2. Mencatat file yang sudah pernah dijalankan di tabel
 *    `schema_migrations` supaya migration tidak dijalankan dua kali.
 * 3. Setiap file dijalankan dalam SATU transaksi (atomik): bila gagal,
 *    perubahan di-rollback dan proses berhenti dengan exit code 1.
 *
 * Sengaja TIDAK memakai framework migration besar — cukup pg dan fs.
 * File SQL tetap dibuat idempotent (CREATE ... IF NOT EXISTS) sebagai
 * lapis pengaman tambahan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getPool, closePool, DatabaseNotConfiguredError } from './pool';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'server', 'migrations');

async function main(): Promise<void> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Folder migration tidak ditemukan: ${MIGRATIONS_DIR}`);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[migrate] Tidak ada file .sql di server/migrations.');
    return;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Tabel pencatat migration yang sudah diterapkan.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (row) => row.filename,
      ),
    );

    let appliedCount = 0;
    let skippedCount = 0;

    for (const filename of files) {
      if (applied.has(filename)) {
        skippedCount += 1;
        console.log(`[migrate] Lewat (sudah diterapkan): ${filename}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${filename} gagal dan di-rollback: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      appliedCount += 1;
      console.log(`[migrate] Diterapkan: ${filename}`);
    }

    console.log(
      `[migrate] Selesai. ${appliedCount} diterapkan, ${skippedCount} dilewati (dari ${files.length} file).`,
    );
  } finally {
    client.release();
  }
}

main()
  .then(async () => {
    await closePool();
  })
  .catch(async (err: unknown) => {
    if (err instanceof DatabaseNotConfiguredError) {
      console.error('[migrate] DATABASE_URL belum dikonfigurasi di .env.');
    } else {
      console.error(`[migrate] Gagal: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await closePool();
    } catch {
      // Abaikan: pool mungkin belum terbentuk.
    }
    process.exitCode = 1;
  });
