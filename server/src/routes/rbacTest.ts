import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

/**
 * Endpoint TEST INTERNAL untuk validasi RBAC (Phase 2C-3).
 *
 * BUKAN fitur produksi dan BUKAN API bisnis — tidak menyentuh data
 * surat/dokumen apa pun. Hanya di-mount bila environment
 * RBAC_TEST_ROUTES=true (lihat app.ts dan config/env.ts).
 *
 * Endpoint ini memperlihatkan pola pemakaian yang akan dipakai
 * endpoint nyata nanti:
 *
 *   router.get('/x', requireAuth, requireRole('admin'), handler);
 *   router.get('/x', requireAuth, requireRole('admin', 'petugas'), handler);
 */
export const rbacTestRouter = Router();

// admin-only: cakupan administratif penuh.
rbacTestRouter.get('/_test/rbac/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.status(200).json({ status: 'ok', scope: 'admin-only', role: req.authUser?.role });
});

// operasional: admin + petugas (akses operasional arsip).
rbacTestRouter.get(
  '/_test/rbac/operasional',
  requireAuth,
  requireRole('admin', 'petugas'),
  (req, res) => {
    res.status(200).json({ status: 'ok', scope: 'operasional', role: req.authUser?.role });
  },
);

// baca/monitoring: admin + petugas + pimpinan (semua role valid).
rbacTestRouter.get(
  '/_test/rbac/baca',
  requireAuth,
  requireRole('admin', 'petugas', 'pimpinan'),
  (req, res) => {
    res.status(200).json({ status: 'ok', scope: 'baca-monitoring', role: req.authUser?.role });
  },
);
