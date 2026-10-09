import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { DatabaseNotConfiguredError, query } from '../db';
import { config } from '../config/env';
import { dummyPasswordVerify, verifyPassword } from '../auth/password';
import { loadAuthUser } from '../auth/user';
import { clearSessionCookie, destroySession, regenerateSession, saveSession } from '../session/session';
import { requireAuth } from '../middleware/requireAuth';

/**
 * Endpoint authentication (Phase 2C-1):
 *   POST /api/auth/login
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *
 * Prinsip keamanan yang dipakai:
 * - Server-side session di PostgreSQL (bukan JWT).
 * - Pesan gagal login selalu sama → tidak membocorkan keberadaan username.
 * - Rate limit hanya untuk login, tidak global.
 * - Semua SQL memakai parameterized query.
 * - password_hash dan session id tidak pernah masuk respons/log.
 */

export const authRouter = Router();

/** Pesan kegagalan login yang SELALU sama untuk semua penyebab. */
const LOGIN_FAILED_MESSAGE = 'Username atau password salah.';

const MAX_USERNAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 200;

/**
 * Rate limit KHUSUS endpoint login (bukan global).
 * Konfigurasi dari environment (LOGIN_RATE_LIMIT_*), bukan hardcode.
 * Catatan: store-nya in-memory → cocok untuk satu instance aplikasi internal;
 * bila nanti berjalan multi-instance, perlu store bersama (mis. Redis/PostgreSQL).
 */
const loginLimiter = rateLimit({
  windowMs: config.loginRateLimitWindowMs,
  limit: config.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi beberapa saat lagi.' },
});

/**
 * Validasi body login di SERVER.
 * Mengembalikan null bila bentuk input tidak valid (password tidak
 * pernah ikut dikirim ke mana pun dalam keadaan ini).
 */
function parseLoginBody(body: unknown): { username: string; password: string } | null {
  if (typeof body !== 'object' || body === null) return null;

  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') return null;

  // Username di-trim; password TIDAK (spasi bisa jadi bagian password).
  const normalizedUsername = username.trim();
  if (normalizedUsername.length === 0 || normalizedUsername.length > MAX_USERNAME_LENGTH) return null;
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return null;

  return { username: normalizedUsername, password };
}

interface LoginUserRow {
  id: string;
  username: string;
  password_hash: string;
  is_active: boolean;
}

/**
 * POST /api/auth/login
 * Sukses → regenerate session (anti fixation), simpan userId minimal,
 * update last_login_at, kembalikan user aman tanpa password_hash.
 */
authRouter.post('/auth/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credentials = parseLoginBody(req.body);
    if (!credentials) {
      res.status(400).json({ error: 'Username dan password wajib diisi dengan format yang benar.' });
      return;
    }

    const result = await query<LoginUserRow>(
      'SELECT id, username, password_hash, is_active FROM users WHERE username = $1',
      [credentials.username],
    );
    const row = result.rows[0];

    // Waktu proses dibuat seragam:
    // - user tidak ada  → tetap jalankan bcrypt terhadap hash dummy
    // - user ada        → jalankan bcrypt terhadap hash asli
    // sehingga durasi respons tidak membocorkan keberadaan username.
    let loginOk = false;
    if (row) {
      const passwordOk = await verifyPassword(credentials.password, row.password_hash);
      loginOk = passwordOk && row.is_active;
    } else {
      await dummyPasswordVerify(credentials.password);
    }

    if (!row || !loginOk) {
      res.status(401).json({ error: LOGIN_FAILED_MESSAGE });
      return;
    }

    // Catat login terakhir SEBELUM session dibuat, agar kegagalan
    // database tidak menghasilkan session setengah jadi.
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);

    const user = await loadAuthUser(Number(row.id));
    if (!user) {
      res.status(401).json({ error: LOGIN_FAILED_MESSAGE });
      return;
    }

    // Session fixation: ganti ID session lama dengan yang baru.
    await regenerateSession(req);
    // Simpan identitas MINIMUM di server (hanya userId); role dll diambil dari database.
    req.session.userId = user.id;
    await saveSession(req);

    // Respons aman: tanpa password_hash, tanpa session id, tanpa cookie value.
    res.status(200).json({ user });
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError) {
      res.status(503).json({ error: 'Database belum dikonfigurasi di server.' });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Menghancurkan session di server + menghapus cookie.
 * Aman (tetap 200) walau sebenarnya belum pernah login.
 */
authRouter.post('/auth/logout', async (req: Request, res: Response, next: NextFunction) => {
  const hadSession = typeof req.session?.userId === 'number';

  try {
    if (hadSession) {
      await destroySession(req);
    }
    clearSessionCookie(res);
    res.status(200).json({ status: 'ok', message: 'Berhasil logout.' });
  } catch (err) {
    // Cookie selalu dibuang, bahkan bila store bermasalah.
    clearSessionCookie(res);
    if (err instanceof DatabaseNotConfiguredError) {
      res.status(503).json({ error: 'Database belum dikonfigurasi di server.' });
      return;
    }
    next(err);
  }
});

/**
 * GET /api/auth/me
 * 401 bila belum login; bila login, kembalikan user dari database
 * (lewat requireAuth) tanpa password_hash.
 */
authRouter.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  if (!req.authUser) {
    res.status(401).json({ error: 'Belum login.' });
    return;
  }
  res.status(200).json({ user: req.authUser });
});
