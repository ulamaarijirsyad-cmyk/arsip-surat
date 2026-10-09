import { Request, Response, NextFunction } from 'express';

/**
 * Error handler dasar (Phase 1, disempurnakan Phase 2C-1).
 *
 * - Error client (4xx, mis. JSON rusak dari body-parser) → status aslinya
 *   dikembalikan dengan pesan generik yang aman.
 * - Error server (5xx) → selalu 500 dengan pesan generik; pesan internal
 *   TIDAK pernah dibocorkan ke client.
 * - Password / session id / detail koneksi tidak pernah masuk ke respons.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const rawStatus = (err as { statusCode?: unknown } | undefined)?.statusCode;
  const statusCode = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;

  // Error database (pg) punya properti `code` — cukup log ringkasan,
  // jangan print pesan asli (bisa memuat host/user database).
  const pgCode = (err as { code?: unknown } | undefined)?.code;
  const errName = err instanceof Error ? err.name : 'UnknownError';

  if (statusCode < 500) {
    // Client error: cukup log ringkas (tanpa stack, tanpa isi body permintaan).
    const type = (err as { type?: unknown } | undefined)?.type;
    console.error(`[error] Client error (status: ${statusCode}, type: ${typeof type === 'string' ? type : 'unknown'})`);
    res.status(statusCode).json({ error: 'Format permintaan tidak valid.' });
    return;
  }

  // Server error: log di server, respons tetap generik.
  if (typeof pgCode === 'string') {
    console.error(`[error] Database error (code: ${pgCode}, type: ${errName})`);
  } else {
    console.error('[error]', err);
  }
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
}
