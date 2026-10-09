import 'dotenv/config';

/**
 * Konfigurasi aplikasi SI-ARSIP.
 * Semua nilai deployment-spesifik berasal dari environment variable.
 * Jangan hardcode localhost/IP/path absolut di source code.
 */

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Environment variable ${name} belum diatur.`);
  }
  return value;
}

/**
 * Membaca environment variable berupa angka positif.
 * Melempar error bila nilainya bukan angka atau <= 0,
 * agar konfigurasi rusak langsung ketahuan saat startup.
 */
function getPositiveNumber(name: string, fallback: number): number {
  const value = Number(getEnv(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} harus berupa angka positif.`);
  }
  return value;
}

export const config = {
  port: Number(getEnv('PORT', '3001')),

  // Connection string PostgreSQL. JANGAN pernah di-log atau dikirim ke client.
  // Kosong = database belum dikonfigurasi (server tetap bisa berjalan).
  databaseUrl: getEnv('DATABASE_URL', ''),

  // Jumlah maksimum koneksi dalam pool.
  dbPoolMax: Number(getEnv('DB_POOL_MAX', '10')),

  // Batas waktu (ms) membuat koneksi baru, agar request tidak menggantung.
  dbConnectionTimeoutMs: Number(getEnv('DB_CONNECTION_TIMEOUT_MS', '5000')),

  // 'true' bila PostgreSQL mewajibkan SSL (umumnya cloud). 'false' untuk LAN.
  dbSsl: getEnv('DB_SSL', 'false') === 'true',

  // Secret untuk menandatangani cookie session (Phase 2C: authentication).
  // Kosong = belum diatur; middleware session akan menolak start dan
  // memberi pesan jelas. Nilai nyata HANYA ada di .env (bukan di sini).
  sessionSecret: getEnv('SESSION_SECRET', ''),

  // Umur maksimum session login (detik). Default: 8 jam.
  sessionMaxAgeSeconds: getPositiveNumber('SESSION_MAX_AGE_SECONDS', 8 * 60 * 60),

  // Rate limit KHUSUS POST /api/auth/login:
  // maksimal loginRateLimitMax percobaan per loginRateLimitWindowMs.
  loginRateLimitWindowMs: getPositiveNumber('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  loginRateLimitMax: getPositiveNumber('LOGIN_RATE_LIMIT_MAX', 10),

  // Cost factor bcrypt untuk hashing password baru (Phase 2C-2).
  // Semakin besar = semakin lambat dihash, semakin berat diserang.
  bcryptRounds: getPositiveNumber('BCRYPT_ROUNDS', 10),

  // Batas ukuran SATU file lampiran saat upload (Phase 2E-2), dalam MB.
  // Keputusan spesifikasi: 5 MB (default) — bisa diubah lewat MAX_UPLOAD_MB.
  // Nilai byte dipakai multer untuk membatasi stream SEBELUM file disimpan
  // di memori, sehingga upload kebesaran tidak pernah tertampung penuh.
  maxUploadMb: getPositiveNumber('MAX_UPLOAD_MB', 5),
  maxUploadBytes: getPositiveNumber('MAX_UPLOAD_MB', 5) * 1024 * 1024,

  // 'local' | 's3' (untuk saat ini hanya 'local' yang disiapkan konsepnya).
  storageType: getEnv('STORAGE_TYPE', 'local'),
  storageDir: getEnv('STORAGE_DIR', ''),

  // 'true' bila aplikasi diakses via HTTPS (cloud). 'false' untuk LAN HTTP.
  cookieSecure: getEnv('COOKIE_SECURE', 'false') === 'true',

  // 'true' = mount endpoint test RBAC (/api/_test/rbac/*) untuk pengujian
  // Phase 2C-3. Default 'false' — JANGAN diaktifkan di produksi.
  rbacTestRoutes: getEnv('RBAC_TEST_ROUTES', 'false') === 'true',
} as const;
