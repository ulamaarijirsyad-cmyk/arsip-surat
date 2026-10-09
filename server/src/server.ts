import { createApp } from './app';
import { config } from './config/env';
import { StorageError, ensureStorageDir, validateStorageConfig } from './storage';

/**
 * Phase 2E-1 — validasi konfigurasi penyimpanan SEBELUM server mulai.
 *
 * Bila STORAGE_TYPE/STORAGE_DIR tidak valid (atau direktori tidak bisa
 * dibuat), server GAGAL start dengan pesan aman lalu exit(1):
 * - pesan berasal dari StorageError (dijinakkan) atau pesan generik,
 * - TIDAK PERNAH mencetak DATABASE_URL, SESSION_SECRET, password,
 *   maupun kredensial lain.
 *
 * CLI lain (db:migrate, user:create-admin) tidak melewati blok ini sehingga
 * tetap bisa dijalankan tanpa STORAGE_DIR.
 */
try {
  const storageDir = validateStorageConfig(config.storageType, config.storageDir);
  ensureStorageDir(storageDir);
} catch (err) {
  const message = err instanceof StorageError ? err.message : 'Konfigurasi penyimpanan tidak valid.';
  console.error(`[storage] Server tidak dijalankan: ${message}`);
  console.error("[storage] Isi STORAGE_TYPE='local' dan STORAGE_DIR (path absolut) di file .env — lihat .env.example.");
  process.exit(1);
}

const app = createApp();

app.listen(config.port, () => {
  console.log(`SI-ARSIP server berjalan di port ${config.port}`);
  console.log(`Health check tersedia di /api/health (port ${config.port})`);
});
