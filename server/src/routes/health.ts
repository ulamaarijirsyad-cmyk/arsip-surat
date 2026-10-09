import { Router } from 'express';
import { checkDatabase, DatabaseNotConfiguredError } from '../db';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Cek koneksi ke PostgreSQL dengan menjalankan `SELECT 1`.
 * Respons dan log sengaja tidak memuat password, connection string,
 * host, maupun pesan error asli dari driver.
 */
healthRouter.get('/health/db', async (_req, res) => {
  try {
    await checkDatabase();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      res.status(503).json({
        status: 'error',
        database: 'not_configured',
        message: 'DATABASE_URL belum dikonfigurasi di server.',
      });
      return;
    }

    // Log hanya code & nama error, bukan pesan asli (bisa memuat detail koneksi).
    const code = (err as { code?: unknown })?.code;
    const name = err instanceof Error ? err.name : 'UnknownError';
    console.error(
      `[db] Health check gagal (code: ${typeof code === 'string' ? code : 'unknown'}, type: ${name})`,
    );
    res.status(503).json({
      status: 'error',
      database: 'unavailable',
      message: 'Server tidak dapat terhubung ke database. Periksa konfigurasi dan log server.',
    });
  }
});
