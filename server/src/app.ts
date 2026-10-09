import express from 'express';
import path from 'path';
import fs from 'fs';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { rbacTestRouter } from './routes/rbacTest';
import { suratMasukRouter } from './routes/suratMasuk';
import { documentsRouter } from './routes/documents';
import { createSessionMiddleware } from './session/session';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config/env';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // Session server-side (PostgreSQL store) — dipasang SEBELUM semua
  // route API agar tersedia untuk auth dan route berikutnya.
  app.use(createSessionMiddleware());

  // API routes
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  // Surat Masuk API (Phase 2D-1) — wajib login via requireAuth/requireRole.
  app.use('/api', suratMasukRouter);
  // Lampiran dokumen (Phase 2E-2) — upload/preview/download/delete.
  // Storage TIDAK pernah di-mount sebagai static directory: file hanya
  // diambil lewat endpoint ber-authenticasi ini.
  app.use('/api', documentsRouter);

  // Endpoint test RBAC (Phase 2C-3) — hanya saat RBAC_TEST_ROUTES=true.
  // Default mati: tidak menjadi bagian fitur produksi.
  if (config.rbacTestRoutes) {
    app.use('/api', rbacTestRouter);
    console.log('[rbac] Endpoint test RBAC aktif (RBAC_TEST_ROUTES=true) — hanya untuk pengujian.');
  }

  // Serve React production build jika sudah ada (npm run build).
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    // SPA fallback: semua path non-API mengarah ke index.html
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
