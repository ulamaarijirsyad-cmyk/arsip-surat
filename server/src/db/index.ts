import type { QueryResult, QueryResultRow } from 'pg';
import { getPool } from './pool';

export { closePool, DatabaseNotConfiguredError } from './pool';

/**
 * Menjalankan query dengan parameterized query ($1, $2, ...).
 * Nilai dari user HARUS selalu dikirim lewat `params`, tidak pernah
 * digabung (string concatenation) ke dalam teks SQL.
 *
 * Contoh: query('SELECT * FROM x WHERE id = $1', [id])
 */
export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<R>> {
  return getPool().query<R>(text, params as unknown[]);
}

/**
 * Memastikan server benar-benar dapat menjalankan query ke PostgreSQL.
 * Melempar error bila koneksi gagal.
 */
export async function checkDatabase(): Promise<void> {
  const result = await query<{ ok: number }>('SELECT 1 AS ok');
  if (result.rows[0]?.ok !== 1) {
    throw new Error('Hasil SELECT 1 tidak sesuai harapan.');
  }
}
