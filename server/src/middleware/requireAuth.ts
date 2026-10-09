import type { NextFunction, Request, Response } from 'express';
import { loadAuthUser } from '../auth/user';
import { clearSessionCookie, destroySession } from '../session/session';

/**
 * requireAuth — middleware reusable untuk endpoint yang wajib login.
 *
 * Sumber kebenaran: session server-side di PostgreSQL, BUKAN header /
 * cookie / role yang dikirim browser. User divalidasi ulang ke
 * database sehingga akun yang dihapus atau dinonaktifkan langsung
 * kehilangan akses.
 *
 * Bila valid → `req.authUser` terisi (id, username, full_name, role).
 * Bila tidak  → 401 dengan pesan umum (tanpa detail penyebab).
 *
 * Authorization/role penuh (RBAC) dibuat pada Phase 2C-3.
 *
 * Contoh pemakaian:
 *   router.get('/surat', requireAuth, handler)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.session?.userId;

    if (typeof userId !== 'number') {
      res.status(401).json({ error: 'Belum login.' });
      return;
    }

    const user = await loadAuthUser(userId);
    if (!user) {
      // Session masih ada, tetapi user sudah tidak valid/non-aktif:
      // hancurkan session server-side dan buang cookie browser-nya.
      try {
        await destroySession(req);
      } catch {
        // Store bermasalah tetap tidak boleh membocorkan detail;
        // cookie tetap dibuang di bawah.
      }
      clearSessionCookie(res);
      res.status(401).json({ error: 'Belum login.' });
      return;
    }

    req.authUser = user;
    next();
  } catch (err) {
    // Termasuk DatabaseNotConfiguredError → lempar ke error handler global.
    next(err);
  }
}
