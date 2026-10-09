import type { RequestHandler } from 'express';
import { isRoleName, type RoleName } from '../auth/roles';

/**
 * requireRole(...allowedRoles) — authorization berbasis role (Phase 2C-3).
 *
 * Pemakaian (wajib setelah requireAuth):
 *
 *   router.get('/contoh', requireAuth, requireRole('admin'), handler);
 *   router.get('/contoh', requireAuth, requireRole('admin', 'petugas'), handler);
 *
 * Pemisahan tanggung jawab:
 *   requireAuth      → SIAPA user? (session → database → user aktif)
 *   requireRole(...) → bolehkah user itu melakukan tindakan ini?
 *
 * Aturan:
 * - Default DENY: tanpa authUser → 401; role tak dikenal / tak diizinkan → 403.
 * - Role dibaca dari `req.authUser` yang diisi requireAuth dari DATABASE.
 *   Role dari body/query/header/cookie buatan/localStorage TIDAK PERNAH dibaca.
 * - Perbandingan berdasarkan NAME, bukan ID.
 * - Pesan error umum, tanpa daftar role internal / detail database.
 *
 * Policy Phase 2C-3:
 *   admin    → akses administratif penuh
 *   petugas  → akses operasional arsip
 *   pimpinan → akses baca/monitoring
 */
export function requireRole(...allowedRoles: RoleName[]): RequestHandler {
  if (allowedRoles.length === 0) {
    // Kesalahan programming: gagalkan saat startup, jangan membuat
    // middleware yang diam-diam menolak semua orang.
    throw new Error('requireRole() membutuhkan minimal satu role.');
  }

  // Disalin ke readonly string[] agar aman dibandingkan dengan role
  // dari database yang bertipe string (bisa berisi role tak dikenal).
  const allowed: readonly string[] = allowedRoles;

  return (req, res, next) => {
    try {
      const user = req.authUser;

      // Belum login / requireAuth tidak dipasang → 401 (bukan 403).
      if (!user) {
        res.status(401).json({ error: 'Belum login.' });
        return;
      }

      // Role tak dikenal di database ATAU tidak termasuk yang diizinkan → 403.
      if (!isRoleName(user.role) || !allowed.includes(user.role)) {
        res.status(403).json({
          error: 'Anda tidak memiliki hak akses untuk melakukan tindakan ini.',
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
