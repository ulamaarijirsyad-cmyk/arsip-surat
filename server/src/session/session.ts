import type { Request, RequestHandler, Response } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import type { Pool } from 'pg';
import { config } from '../config/env';
import { getPool } from '../db/pool';

/**
 * Session server-side (Phase 2C-1).
 *
 * Alur: Browser → Express → middleware session ini → session store
 * PostgreSQL (tabel `session`, dibuat migration 003) → user terotentikasi.
 *
 * BUKAN JWT: identitas disimpan di database, cookie hanya berisi
 * ID acak yang sudah ditandatangani server.
 */

/** Nama cookie session (bukan default 'connect.sid' agar tidak membingkai framework). */
const SESSION_COOKIE_NAME = 'siarsip.sid';

/**
 * "Pool lazy": connect-pg-simple hanya memanggil `pool.query(...)`,
 * jadi koneksi PostgreSQL baru dibuat pada query pertama — bukan saat
 * server start. Perilaku Phase 1 dipertahankan: server tetap bisa
 * berjalan walau DATABASE_URL belum diisi (health endpoint tetap hidup),
 * dan baris session baru disentuh saat auth benar-benar dipakai.
 */
const lazyPool = {
  query: (text: string, params?: readonly unknown[]) => getPool().query(text, params as unknown[]),
} as unknown as Pool;

/** Ringkasan error yang AMAN di-log (hanya kode & tipe, tanpa pesan pg yang bisa memuat detail koneksi). */
function safeErrorSummary(err: unknown): string {
  const code = (err as { code?: unknown } | undefined)?.code;
  const name = err instanceof Error ? err.name : 'UnknownError';
  return `code: ${typeof code === 'string' ? code : 'unknown'}, type: ${name}`;
}

let cachedStore: session.Store | null = null;
let cachedMiddleware: RequestHandler | null = null;

function createStore(): session.Store {
  if (cachedStore) return cachedStore;

  const PgStore = connectPgSimple(session);
  cachedStore = new PgStore({
    pool: lazyPool,
    tableName: 'session', // dibuat oleh server/migrations/003_create_session_store.sql
    ttl: config.sessionMaxAgeSeconds, // masa berlaku baris session di database
    pruneSessionInterval: 3600, // bersihkan session kadaluarsa kira-kira tiap jam
    // TABEL TIDAK BOLEH dibuat sendiri oleh library — harus lewat migration.
    createTableIfMissing: false,
    // Jangan print pesan error pg apa adanya (bisa memuat detail koneksi).
    errorLog: (message: unknown, err?: unknown) => {
      console.error(`[session] ${String(message)} (${safeErrorSummary(err)})`);
    },
  });
  return cachedStore;
}

/**
 * Membuat (sekali) middleware session express-session dengan:
 * - HttpOnly: true
 * - SameSite: 'lax'
 * - Secure: mengikuti COOKIE_SECURE
 * - maxAge: SESSION_MAX_AGE_SECONDS
 * - store: PostgreSQL
 *
 * Melempar error bila SESSION_SECRET kosong/kurang dari 32 karakter,
 * supaya server gagal start dengan pesan jelas (bukan jalan tanpa
 * proteksi).
 */
export function createSessionMiddleware(): RequestHandler {
  if (cachedMiddleware) return cachedMiddleware;

  if (config.sessionSecret.length < 32) {
    throw new Error(
      'SESSION_SECRET belum diatur atau kurang dari 32 karakter. ' +
        'Isi nilai acak panjang di file .env (lihat .env.example).',
    );
  }

  cachedMiddleware = session({
    secret: config.sessionSecret,
    name: SESSION_COOKIE_NAME,
    store: createStore(),
    resave: false, // session tidak di-write ulang bila tidak berubah
    saveUninitialized: false, // cookie baru hanya dikirim setelah login berhasil
    cookie: {
      httpOnly: true, // tidak bisa diakses JavaScript di browser
      sameSite: 'lax',
      secure: config.cookieSecure, // 'true' bila COOKIE_SECURE=true (HTTPS)
      path: '/',
      maxAge: config.sessionMaxAgeSeconds * 1000,
    },
  });

  return cachedMiddleware;
}

/** Mengganti ID session dengan yang baru (anti session fixation). Selalu panggil setelah login valid. */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err: unknown) => (err ? reject(err) : resolve()));
  });
}

/** Menyimpan session ke database secara eksplisit sebelum respons dikirim. */
export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err: unknown) => (err ? reject(err) : resolve()));
  });
}

/** Menghancurkan session di sisi server (logout). */
export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err: unknown) => (err ? reject(err) : resolve()));
  });
}

/** Menghapus cookie di browser dengan konfigurasi yang konsisten saat set. */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  });
}
