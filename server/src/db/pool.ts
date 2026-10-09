import { Pool } from 'pg';
import { config } from '../config/env';

/**
 * Dilempar bila DATABASE_URL belum diatur. Pesannya aman ditampilkan
 * (tidak memuat secret apa pun).
 */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL belum dikonfigurasi.');
    this.name = 'DatabaseNotConfiguredError';
  }
}

let pool: Pool | null = null;

/**
 * Mengembalikan pool PostgreSQL tunggal (dibuat saat pertama kali dipakai).
 * Semua kode server berbagi pool yang sama.
 */
export function getPool(): Pool {
  if (pool) return pool;

  if (!config.databaseUrl) {
    throw new DatabaseNotConfiguredError();
  }

  const created = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs,
    ssl: config.dbSsl ? true : undefined,
  });

  // Error pada koneksi idle tidak boleh menjatuhkan proses.
  // Hanya kode error yang di-log; pesan asli dapat memuat detail koneksi.
  created.on('error', (err: Error & { code?: string }) => {
    console.error(`[db] Error pada koneksi idle (code: ${err.code ?? 'unknown'})`);
  });

  pool = created;
  return pool;
}

/** Menutup pool (dipakai saat shutdown). Aman dipanggil berulang. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
